#!/usr/bin/env python3

__copyright__ = 'Copyright (c) 2021-2024, Utrecht University'
__license__   = 'GPLv3, see LICENSE'

import base64
import json
import re
import sys
import zlib
from timeit import default_timer as timer
from typing import Any, Dict, Optional

from flask import Blueprint, g, jsonify, request, Response
from flask import current_app as app
from irods import message, rule

from errors import InvalidAPIError, UnauthorizedAPIAccessError
from util import log_error

api_bp = Blueprint('api_bp', __name__)


@api_bp.route('/<fn>', methods=['POST'])
def _call(fn: str) -> Response:
    if not authenticated():
        raise UnauthorizedAPIAccessError

    if not re.match("^([a-z_]+)$", fn):
        raise InvalidAPIError

    data: Dict[str, Any] = {}
    if 'data' in request.form:
        data = json.loads(request.form['data'])

    result: Dict[str, Any] = call(fn, data)
    code: int = 200

    if result['status'] == 'error_internal':
        code = 500
    elif result['status'] != 'ok':
        code = 400

    response = jsonify(result)
    response.status_code = code
    return response


def call(fn: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    def bytesbuf_to_str(s: message.BinBytesBuf) -> str:
        s = s.buf[:s.buflen]
        i = s.find(b'\x00')
        return s if i < 0 else s[:i]

    def escape_quotes(s: str) -> str:
        return s.replace('\\', '\\\\').replace('"', '\\"')

    def break_strings(N: int, m: int) -> int:
        return (N - 1) // m + 1

    def nrep_string_expr(s: str, m: int = 64) -> str:
        return '++\n'.join(f'"{escape_quotes(s[i * m:i * m + m])}"' for i in range(break_strings(len(s), m) + 1))

    if app.config.get('LOG_API_CALL_DURATION', False):
        begintime = timer()

    if data is None:
        data = {}

    params = json.dumps(data)

    # Compress params and encode as base64 to reduce size (max rule length in iRODS is 20KB)
    compressed_params = zlib.compress(params.encode())
    base64_encoded_params = base64.b64encode(compressed_params)
    arg_str_expr = nrep_string_expr(base64_encoded_params.decode('utf-8'))

    # Set parameters as variable instead of parameter input to circumvent iRODS string limits.
    rule_body = f''' *x={arg_str_expr}
                    api_{fn}(*x)
                '''

    x = rule.Rule(
        g.irods,
        instance_name='irods_rule_engine_plugin-irods_rule_language-instance',
        body=rule_body,
        params={},
        output='ruleExecOut')

    # Cleanup session for vault actions calling msiExecCmd.
    if fn in ['vault_submit', 'vault_approve', 'vault_cancel', 'vault_depublish', 'vault_republish']:
        g.irods.cleanup()

    x = x.execute(session_cleanup=False)
    x = bytesbuf_to_str(x._values['MsParam_PI'][0]._values['inOutStruct']._values['stdoutBuf'])

    result = x.decode()

    if app.config.get('LOG_API_CALL_DURATION', False):
        endtime = timer()
        callduration = round((endtime - begintime) * 1000)
        print(f"DEBUG: {callduration:4d}ms api_{fn} {params}", file=sys.stderr)

    return json.loads(result)


def authenticated() -> bool:
    return g.get('user') is not None and g.get('irods') is not None


@api_bp.errorhandler(Exception)
def api_error_handler(error: Exception) -> Response:
    log_error(f'API Error: {error}', True)
    status = "internal_error"
    status_info = "Something went wrong"
    data: Dict[str, Any] = {}
    code = 500

    if type(error) == InvalidAPIError:
        code = 400
        status_info = "Bad API request"

    if type(error) == UnauthorizedAPIAccessError:
        code = 401
        status_info = "Not authorized to use the API"

    return jsonify(
        {
            "status": status,
            "status_info": status_info,
            "data": data
        }), code
