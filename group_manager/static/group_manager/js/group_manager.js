/* global bootstrap, DOMPurify, FileReader, jQuery, Option */
'use strict'

let enteredUsername = ''
let didScroll
let lastScrollTop = 0

setInterval(function () {
  if (didScroll) {
    collapseUncollapseOnScroll()
    didScroll = false
  }
}, 400)

function collapseUncollapseOnScroll () {
  // Collapse or uncollapse group properties on scroll, if the right pane is too long
  const buffer = 20
  const delta = 10
  const collapseDelta = 400
  const topOfScreenPoint = 60
  const collapsePoint = 300
  const st = Math.floor(window.scrollY)
  let collapseEl = bootstrap.Collapse.getInstance('#group-properties')
  if (!collapseEl) {
    collapseEl = new bootstrap.Collapse('#group-properties', {
      toggle: false
    })
  }

  if (Math.abs(lastScrollTop - st) <= delta) {
    return
  }

  if (st <= lastScrollTop && st <= topOfScreenPoint) {
    // Near the top of the screen
    bootstrap.Collapse.getInstance('#group-properties').show()
  } else if (st > lastScrollTop &&
    st > collapsePoint &&
    Math.abs(lastScrollTop - st) <= collapseDelta &&
    $('#group-overview').outerHeight() + buffer > $(window).height()) {
    // Have scrolled down at least a little
    bootstrap.Collapse.getInstance('#group-properties').hide()
  }

  lastScrollTop = st
}

function flatListGroups () {
  // Create flat list of groups including filter handling on username and groupname.
  // Centralized handling of contents of fields in the frontend related to this functionality.
  const search = $('#search').val()
  let username = ''
  let groupname = ''

  if (search.startsWith('user:')) {
    username = search.substr(5)
    groupname = ''
  } else if (search.startsWith('group:')) {
    groupname = search.substr(6)
    username = ''
  }

  const hier = Yoda.groupManager.groupHierarchy
  const data = []

  // Prepare the search argument (for finding a user).
  const user = (username === '' ? Yoda.groupManager.userNameFull : username)

  for (const categoryName in hier) {
    for (const subcategoryName in hier[categoryName]) {
      for (const groupName in hier[categoryName][subcategoryName]) {
        if (user === '' || user === Yoda.groupManager.userNameFull) { // er is geen filter => alle groepen toevoegen
          if (hier[categoryName][subcategoryName][groupName].members[user] !== undefined) {
            data.push([groupName, hier[categoryName][subcategoryName][groupName].members[user].access, categoryName, subcategoryName])
          } else {
            data.push([groupName, false, categoryName, subcategoryName])
          }
        } else {
          // find the user within the group array
          if (hier[categoryName][subcategoryName][groupName].members[user] !== undefined) {
            data.push([groupName, hier[categoryName][subcategoryName][groupName].members[user].access, categoryName, subcategoryName])
          }
        }
      }
    }
  }

  // Build result table.
  let table = '<table id="tbl-list-groups" class="table table-striped"><thead><tr><th>Group</th><th>Category</th><th>Subcategory</th><th></th><th></th></tr></thead><tbody>'
  $.each(data, function (index, usergroup) {
    if (usergroup[0].includes(groupname)) {
      table += `<tr style="cursor: pointer" class="user-search-result-group" user-search-result-group="${usergroup[0]}">
                     <td>${usergroup[0]}</td>
                     <td>${usergroup[2]}</td>
                     <td>${usergroup[3]}</td>`

      if (usergroup[0].match(/^(research)-/)) {
        table += '<td><a href="/research/?dir=' + encodeURIComponent('/' + usergroup[0]) + '" title="Go to group ' + usergroup[0] + ' in research space"><i class="fa-regular fa-folder"></i></a></td>'
      } else {
        table += '<td></td>'
      }

      if (usergroup[1] === 'manager') {
        table += '<td><i class="fa-solid fa-crown" title="You manage this group"></i></td>'
      } else if (usergroup[1] === 'reader') {
        table += '<td><i class="fa-solid fa-eye" title="You have read access to this group"></i></td>'
      } else if (Yoda.groupManager.isRodsAdmin && usergroup[1] !== 'normal') {
        table += '<td><i class="fa-solid fa-wrench" title="You are not a member of this group, but you can manage it as an iRODS administrator"></i></td>'
      } else {
        table += '<td></td>'
      }

      table += '</tr>'
    }
  })
  table += '</tbody></table>'
  $('#result-user-search-groups').html(table)

  // Clicking a row must highlight rows in both tree/flat list and present details in the corresponding panel
  $('.user-search-result-group').on('click', function () {
    // $('#user-search-groups').modal('hide');
    const groupName = $(this).attr('user-search-result-group')
    Yoda.groupManager.unfoldToGroup(groupName)
    Yoda.groupManager.selectGroup(groupName)
  })
}

function treeListGroups () {
  const search = $('#search').select2('data')[0].id
  let username = ''
  let groupname = ''

  if (search.startsWith('user:')) {
    username = search.substr(5)
    groupname = ''
  } else if (search.startsWith('group:')) {
    groupname = search.substr(6)
    username = ''
  }

  const $groupList = $('#group-list')

  // Reset all filters first and re-evaluate the entire situation
  const $filtered = $groupList.find('.filtered')
  $filtered.each(function () {
    $(this).removeClass('filtered')
  })

  // Filter on groups
  if (groupname.length) {
    const $groups = $groupList.find('.group')
    // Filter all group not matching search value.
    const quotedVal = Yoda.escapeQuotes(groupname.toLowerCase())
    $groups.filter('.filtered[data-name*="' + quotedVal + '"]').removeClass('filtered')
    $groups.filter(':not(.filtered):not([data-name*="' + quotedVal + '"])').addClass('filtered')
  }
  // Filter on username but only when username is not current user. Then show the initial list (i.e. unfiltered on username)
  if (username.length && username !== Yoda.groupManager.userNameFull) {
    let group, subcat, cat
    // look at the ones not yet filtered out.
    $groupList.find('.group:not(.filtered)').each(function () {
      group = $(this).data('name')
      subcat = $(this).parent().parent().data('name')
      cat = $(this).parent().parent().parent().parent().data('name')

      if (Yoda.groupManager.groupHierarchy[cat][subcat][group].members[username] === undefined) {
        $(this).addClass('filtered')
      }
    })
  }
  // Loop through categories and filter out empty categories.
  const $categories = $groupList.find('.category')
  $categories.each(function () {
    const $subcategories = $(this).find('.subcategory-ul')
    let emptyCategory = true
    // Loop through subcategories and filter out empty subcategories.
    $subcategories.each(function () {
      if ($(this).children(':not(.filtered)').length === 0) {
        $(this).parent().addClass('filtered')
      } else {
        emptyCategory = false
      }
    })
    if (emptyCategory) {
      $(this).addClass('filtered')
    }
  })
}

function readCsvFile (e) {
  const file = e.target.files[0]
  if (!file) {
    return
  }

  const reader = new FileReader()
  reader.onload = function (e) {
    let contents = e.target.result

    // remove unwanted characters
    contents = contents.replaceAll('"', '').replaceAll("'", '').replaceAll(' ', '').replaceAll('\r', '')

    // remove extra newline(s) at end of file
    while (contents[contents.length - 1] === '\n') {
      contents = contents.slice(0, contents.length - 1)
    }

    // ensure correct separator ','
    contents = contents.replaceAll(';', ',')

    // required to be able to, in a simple manner, add header and data row
    // to the tr's in the table to pass to the backend
    const csvHeader = contents.slice(0, contents.indexOf('\n')).trim()
    const csvRows = contents.slice(contents.indexOf('\n') + 1).split('\n')
    const csvRowsCorrected = []

    // parse the csv file data to be able to present in a table
    const result = csvToArray(contents)

    // For compressing all columns to keys: category, subcategory, groupname, schema, expiration, and usercount
    const presentationColumns = ['groupname', 'category', 'subcategory', 'schema_id', 'expiration_date', 'users']
    // Only the columns that directly display their values
    const directlyPresentColumns = ['groupname', 'category', 'subcategory', 'schema_id', 'expiration_date']
    const allCsvColumns = ['groupname', 'category', 'subcategory', 'manager', 'member', 'viewer', 'schema_id', 'expiration_date']

    // First validate the headers found values in csvHeader
    // 'groupname', 'category', 'subcategory' MUST be present
    // 'manager', 'member', 'viewer', 'expiration_date', 'schema_id' like for instance manager,member,member

    // per csvHeader item check whether its valid
    let errorRows = ''
    csvHeader.split(',').forEach(function myFunction (item) {
      if (!(allCsvColumns.includes(item) || /^(manager|member|viewer):/.test(item))) {
        errorRows += '<li>' + item + '</li>'
      }
    })
    if (errorRows) {
      $('#result-import-groups-csv').html('</br>The uploaded CSV contains the following invalid header names:<br/><ul>' + errorRows + '</ul>')
      return
    }

    const newResult = []
    let rowNr = 0

    // Verify that CSV data does not have duplicate groups, since this can result in unexpected problems, such
    // as trying to create the same group twice.
    const groupsSeen = new Set()
    const duplicateGroups = new Set()

    result.forEach(function scanDuplicates (groupDef) {
      const groupname = groupDef.groupname[0]

      if (groupsSeen.has(groupname)) {
        duplicateGroups.add(groupname)
      } else {
        groupsSeen.add(groupname)
      }
    })

    if (duplicateGroups.size > 0) {
      $('#result-import-groups-csv').html('<br>The uploaded CSV data contains one or more duplicate group names: ' + Array.from(duplicateGroups).join(','))
      return
    }

    result.forEach(function myFunction (groupDef) {
      // initialise all columns that must be present in the view
      const row = []

      presentationColumns.forEach(function myFunction (column) {
        row[column] = ''
      })

      // now loop through the received rows and put them in the right presentation columns
      allCsvColumns.forEach(function myFunction (column) {
        if (groupDef[column] !== undefined && directlyPresentColumns.includes(column)) {
          row[column] = groupDef[column][0]
        } else if (groupDef[column] !== undefined && groupDef[column] !== '\r') {
          if (row.users === '') {
            row.users = groupDef[column].length.toString()
          } else {
            row.users = (parseInt(row.users) + groupDef[column].length).toString()
          }
        }
      })

      // only show row when all required data is present.
      let rowError = false
      presentationColumns.forEach(function myFunction (column) {
        if (!rowError && (row[column] === undefined || row[column] === '') && column !== 'schema_id' && column !== 'expiration_date') {
          rowError = true
        }
      })
      if (rowError === false) {
        newResult.push(row)
        csvRowsCorrected.push(csvRows[rowNr])
      }
      rowNr += 1
    })

    // build the header row of the table
    let table = '<table class="table table-striped"><thead><tr><th></th>'
    presentationColumns.forEach(function myFunction (column) {
      table += '<th>' + column.replace('_', ' ') + '</th>'
    })
    table += '<td></td></tr></thead><tbody>'

    newResult.forEach(function myFunction (groupDef, i) {
      table += '<tr id="' + groupDef.groupname + '" class="import-groupname" groupname="' + groupDef.groupname + '" importRowData="' + csvHeader + '\n' + csvRowsCorrected[i] + '">'
      table += '<td id="processed-indicator-' + groupDef.groupname + '"></td>'
      presentationColumns.forEach(function myFunction (column) {
        table += '<td>' + groupDef[column] + '</td>'
      })
      table += '<td id="error-import-' + groupDef.groupname + '"></td>'
      table += '</tr>'
    })

    table += '</tbody></table>'
    $('#result-import-groups-csv').html(table)

    // now have user choose to actually process the uploaded data.
    $('.div-process-results-import').removeClass('hidden')

    // enable processing again after successful reading
    $('.process-csv').prop('disabled', false)
  }
  reader.readAsText(file)
}

function csvToArray (str, delimiter = ',') {
  const headers = str.slice(0, str.indexOf('\n')).split(delimiter)
  const rows = str.slice(str.indexOf('\n') + 1).split('\n')

  // If we have headers with legacy suffixes, normalize them by removing each suffix
  // e.g. "manager:manager1" becomes "manager".
  headers.forEach(function (element, number, headers) {
    const headerValue = headers[number]
    if (/^(manager|member|viewer):/.test(headerValue)) {
      headers[number] = headerValue.substring(0, headerValue.indexOf(':'))
    }
  })

  const arr = rows.map(function (row) {
    const values = row.split(delimiter)
    const el = headers.reduce(function (object, header, index) {
      if (values[index] != null && values[index] !== '') {
        if (!(header in object)) {
          object[header] = []
        }

        object[header].push(values[index])
      }
      return object
    }, {})
    return el
  })

  if (arr.length > 0 && jQuery.isEmptyObject(arr[arr.length - 1])) {
    return arr.slice(0, arr.length - 1)
  }

  return arr
}

async function processImportedRow (row) {
  // Row specific processing of the imported csv
  const groupname = row.attr('groupname')
  const importRowData = row.attr('importRowData')

  try {
    await Yoda.call('group_process_csv',
      {
        csv_header_and_data: importRowData,
        allow_update: $('#import-allow-updates').is(':checked'),
        delete_users: $('#import-delete-users').is(':checked')
      },
      { quiet: true }).then((data) => {
      // Successful import -> set correct classes and feedback to inform user
      row.addClass('import-groupname-done')
      $('#processed-indicator-' + groupname).html('<i class="fa-solid fa-check"></i>')
      row.addClass('import-csv-group-ok')

      // Solely added for test automation - splinter.
      // This was the only way to be able to perform an automated click work on a row.
      // in itself this functionality is superfluous - as it is dealt with in $('.import-csv-group-ok').click(function() {}
      $('#processed-indicator-' + groupname).on('click', function () {
        const groupName = 'research-' + groupname
        $('#dlg-import-groups-csv').modal('hide')
        Yoda.groupManager.unfoldToGroup(groupName)
        Yoda.groupManager.selectGroup(groupName)
      })
    })
  } catch (error) {
    // Row processing encountered problems => inform user and add appropriate classes.
    row.addClass('import-groupname-done')

    $('#processed-indicator-' + groupname).html('<i class="fa-solid fa-circle-exclamation"></i>')
    row.addClass('table-danger')
    // collect error messages and maken 1 string to present to user.
    let errorHtml = ''
    error.status_info.forEach(function myFunction (item) {
      errorHtml += item + '<br/>'
    })
    $('#error-import-' + groupname).html(errorHtml)
  }
  // if all is complete reload the left pane with data and setup click capability to open newly added groups in the groupmananger
  if ($('.import-groupname').length === $('.import-groupname-done').length) {
    // only enable new groups that have been successfully added
    $('.import-csv-group-ok').on('click', function () {
      const groupName = 'research-' + $(this).attr('groupname')
      $('#dlg-import-groups-csv').modal('hide')
      Yoda.groupManager.unfoldToGroup(groupName)
      Yoda.groupManager.selectGroup(groupName)
    })

    // Renew the data of the left pane as new groups have been added not yet loaded.
    Yoda.call('group_data').then((groupdata) => {
      Yoda.groupManager.groupHierarchy = groupdata.group_hierarchy

      // Collect the latest data and bring into Yoda.groupManager.groups
      Yoda.groupManager.groups = (function (hier) {
        const groups = { }
        for (const categoryName in hier) {
          for (const subcategoryName in hier[categoryName]) {
            for (const groupName in hier[categoryName][subcategoryName]) {
              groups[groupName] = {
                category: categoryName,
                subcategory: subcategoryName,
                name: groupName,
                creation_date: hier[categoryName][subcategoryName][groupName].creation_date,
                description: hier[categoryName][subcategoryName][groupName].description,
                schema_id: hier[categoryName][subcategoryName][groupName].schema_id,
                expiration_date: hier[categoryName][subcategoryName][groupName].expiration_date,
                data_classification: hier[categoryName][subcategoryName][groupName].data_classification,
                members: hier[categoryName][subcategoryName][groupName].members
              }
            }
          }
        }
        return groups
      })(groupdata.group_hierarchy)

      let catIdx = 1
      let html = ''
      let subcatIdx = 1
      let grpIdx = 1
      for (const category in groupdata.group_hierarchy) {
        html += `<div class="list-group-item category" id="category-${catIdx}" data-name="${category}">
                                        <a class="name" data-bs-toggle="collapse" href="#category-${catIdx}-ul" aria-controls="category-${catIdx}-ul" aria-expanded="false" role="button">
                                            <i class="fa-solid fa-caret-right triangle" aria-hidden="true"></i> ${category}
                                        </a>
                                        <div class="list-group collapse category-ul" id="category-${catIdx}-ul">`
        subcatIdx = 1
        for (const subcat in groupdata.group_hierarchy[category]) {
          html +=

                                `<div class="list-group-item subcategory" data-name="${subcat}">
                                    <a class="name" data-bs-toggle="collapse" href="#subcategory-${catIdx}-${subcatIdx}-ul" aria-controls="subcategory-${catIdx}-${subcatIdx}-ul" aria-expanded="false" role="button">
                                        <i class="fa-solid fa-caret-right triangle" aria-hidden="true"></i> ${subcat}
                                    </a>
                                    <div class="list-group collapse subcategory-ul" id="subcategory-${catIdx}-${subcatIdx}-ul">`

          grpIdx = 1
          for (const group in groupdata.group_hierarchy[category][subcat]) {
            html +=
                                        `<a class="list-group-item list-group-item-action group" id="group-${grpIdx}" data-name="${group}">
                                            ${group}
                                        </a>`

            grpIdx += 1
          }

          html += '</div></div>'
          subcatIdx = subcatIdx + 1
        }

        html += '</div></div>'
        catIdx = catIdx + 1
      }
      $('#group-list').html(html)
    })
  }
}

async function processUserroleChange (row, actionUrl, newRole, groupName) {
  // Process one user at a time to change userrole.
  const userName = row.attr('data-name')

  $.ajax({
    url: actionUrl,
    type: 'post',
    dataType: 'json',
    data: {
      group_name: groupName,
      user_name: userName,
      new_role: newRole
    }
  }).done(function (result) {
    if ('status' in result) {
      console.log('User update completed with status ' + result.status)
    }
    if ('status' in result && result.status === 0) {
      // Keep track of which rows have been
      row.addClass('update-done')

      // Set the internal administration with latest situation without having to reach for the dbs
      Yoda.groupManager.groups[groupName].members[userName].access = newRole

      // when update-done length is equal to active length, all has been dealt with.
      // => Data must be reloaded
      if ($('#user-list .active').length === $('#user-list .update-done').length) {
        // Force-regenerate the user list after completion of the entire process
        Yoda.groupManager.deselectGroup()
        Yoda.groupManager.selectGroup(groupName)

        Yoda.set_message('success', 'User roles were updated successfully.')
      }
    } else {
      // Something went wrong
      $('#user-list .user.update-pending[data-name="' + Yoda.escapeQuotes(userName) + '"]')
        .removeClass('update-pending disabled')
        .attr('title', '')

      if ('message' in result) { window.alert(result.message) } else {
        window.alert(
          'Error: Could not change the role for the selected member due to an internal error.\n' +
                    'Please contact a Yoda administrator'
        )
      }
    }
  }).fail(function (result) {
    Yoda.groupManager.ifRequestNotAborted(result, function () {
      window.alert('Error: Could not change the role for the selected member due to an internal error.\nPlease contact a Yoda administrator')
    })
  })
}

async function removeUserFromGroup (row, actionUrl, groupName) {
  // Remove a user from the indicated group as part of mutiple selection of users.
  const userName = row.attr('data-name')

  $.ajax({
    url: actionUrl,
    type: 'post',
    dataType: 'json',
    data: {
      group_name: groupName,
      user_name: userName
    }
  }).done(function (result) {
    if ('status' in result) { console.log('User remove completed with status ' + result.status) }
    if ('status' in result && result.status === 0) {
      // Mark row as done
      row.addClass('remove-done')

      // Update internal administration
      delete Yoda.groupManager.groups[groupName].members[userName]

      if ($('#user-list .active').length === $('#user-list .remove-done').length) {
        // Force-regenerate the user list after completion of entire process
        Yoda.groupManager.deselectGroup()
        Yoda.groupManager.selectGroup(groupName)

        Yoda.set_message('success', 'Users were removed successfully.')
      }
    } else {
      // Something went wrong
      if ('message' in result) { window.alert(result.message) } else {
        window.alert(
          'Error: Could not remove the selected member from the group due to an internal error.\n' +
                    'Please contact a Yoda administrator'
        )
      }
    }
  }).fail(function (result) {
    Yoda.groupManager.ifRequestNotAborted(result, function () {
      window.alert('Error: Could not remove the selected member from the group due to an internal error.\nPlease contact a Yoda administrator')
    })
  })
}

$(function () {
  // Multiple user role change
  $('.users.card .update-button').on('click', function (e) {
    const newRole = $(this).attr('data-target-role')
    const actionUrl = $(this).attr('data-action')
    const groupName = $('#group-list .group.active').attr('data-name')

    // Step through selected users and update per row
    $('#user-list .active.user').each(function myFunction () {
      processUserroleChange($(this), actionUrl, newRole, groupName)
    })
  })

  // Set attributes in modal
  $('#modal-user-delete').on('show.bs.modal', function () {
    const groupName = $('#group-list .group.active').attr('data-name')
    const users = []
    // Get all selected users
    $('#user-list .active.user').each(function myFunction () {
      let name = $(this).attr('data-name')
      name = name.substring(0, name.lastIndexOf('#'))
      users.push(name)
    })

    // Fill modal
    $('#modal-user-delete .user').text(users.join(', '))
    $('#modal-user-delete .group').text(groupName)
  })

  // Remove multiple users from group
  $('#modal-user-delete .confirm').on('click', function (e) {
    // that.onClickUserDelete($('.users.card .delete-button')[0]);
    $('#modal-user-delete').modal('hide')

    const actionUrl = $('#btn-remove-user-from-group').attr('data-action')
    const groupName = $('#group-list .group.active').attr('data-name')

    // Step through selected users and update per row
    $('#user-list .active.user').each(function myFunction () {
      removeUserFromGroup($(this), actionUrl, groupName)
    })
  })

  // CSV import handling {{{
  document.getElementById('file-input').addEventListener('change', readCsvFile, false)

  $('.file-input-click').on('click', function () {
    $('#file-input').val(null)
  })

  $('.import-groups-csv').on('click', function () {
    $('#dlg-import-groups-csv').modal('show')
  })

  $('.process-csv').on('click', function () {
    // First disable the button
    $(this).prop('disabled', true)

    // loop through the rows in the table and, if successful, add a click handler to be able to jump to a group in the groupmananger
    $('.import-groupname').each(function myFunction () {
      processImportedRow($(this))
    })
  })
  // }}}

  // When allowed to add groups the fields have to be initialized. Copy the values of category and subcategory
  $('.create-button-new').on('click', function () {
    $('.properties-update').addClass('hidden')
    $('.users').addClass('hidden')
    $('.properties-create').removeClass('hidden')

    const selectedGroup = Yoda.storage.session.get('selected-group')
    const that = Yoda.groupManager

    // take over category and subcategory from previously selected group.
    let category = ''; let subcategory = ''
    if (selectedGroup !== null && selectedGroup in Yoda.groupManager.groups) {
      category = that.groups[selectedGroup].category
      subcategory = that.groups[selectedGroup].subcategory
    }

    const $prefixDiv = $('#f-group-create-prefix-div')
    $prefixDiv.find('button .text').html(that.GROUP_DEFAULT_PREFIX + '&nbsp;')

    $('#f-group-create-data-classification').val('unspecified').trigger('change')

    $('#f-group-create-prefix-div a[data-value="' + that.GROUP_DEFAULT_PREFIX + '"]').trigger('click')

    $('#f-group-create-name').val('')
    $('#f-group-create-description').val('')

    if (that.canCreateDatamanagerGroup(category)) {
      $('#f-group-create-prefix-datamanager').removeClass('hidden')
    } else {
      $('#f-group-create-prefix-datamanager').addClass('hidden')
    }

    const defaultSchema = new Option(that.schemaIdDefault, that.schemaIdDefault, true, true)
    $('#f-group-create-schema-id').append(defaultSchema).trigger('change')
    $('#f-group-create-schema-id').val(that.schemaIdDefault).trigger('change')

    $('#f-group-create-expiration-date').val('')

    const defaultCategory = new Option(category, category, true, true)
    $('#f-group-create-category').append(defaultCategory).trigger('change')

    const defaultSubcategory = new Option(subcategory, subcategory, true, true)
    $('#f-group-create-subcategory').append(defaultSubcategory).trigger('change')

    $('#f-group-create-name').trigger('focus')
  })

  // Intercept group creation submission of form
  $('#f-group-create-submit').on('click', function () {
    Yoda.groupManager.onSubmitGroupCreateOrUpdate(this)
  })

  // Intercept group update submission of form
  $('#f-group-update-submit').on('click', function () {
    Yoda.groupManager.onSubmitGroupCreateOrUpdate(this)
  })

  Yoda.groupManager = {

    /**
         * \brief If the amount of visible groups is higher than or equal to this value,
         *        categories in the group list will be folded on page load.
         */
    CATEGORY_FOLD_THRESHOLD: 8,

    /// Group name prefixes that can be shown in the group manager.
    /// NB: To make group prefixes selectable in the group add dialog, the
    /// view phtml must be edited.
    GROUP_PREFIXES_RE: /^(grp-|priv-|intake-|vault-|research-|deposit-|datamanager-|datarequests-)/,

    /// A subset of GROUP_PREFIXES_RE that cannot be selected for group creation, and that cannot be deleted.
    GROUP_PREFIXES_RESERVED_RE: /^(priv-|vault-)/,

    GROUP_PREFIXES_WITH_DATA_CLASSIFICATION: ['research-', 'intake-'],

    GROUP_PREFIXES_WITH_SCHEMA_ID: ['research-', 'deposit-'],

    GROUP_PREFIXES_WITH_EXPIRATION_DATE: ['research-'],

    /// The default prefix when adding a new group.
    GROUP_DEFAULT_PREFIX: 'research-',

    unloading: false, /// < Set to true when a navigation action is detected. Used for better error reporting.

    groupHierarchy: null, /// < A group hierarchy object. See Yoda.groupManager.load().
    groups: null, /// < A list of group objects with member information. See Yoda.groupManager.load().

    isRodsAdmin: false, // This will be set in Yoda.groupManager.load().

    zone: null,
    userNameFull: null, /// < The username, including the zone name.

    /// A list of access / membership levels.
    accessLevels: ['reader', 'normal', 'manager'],

    /// Icon classes for access levels.
    accessIcons: {
      reader: 'fa-eye',
      normal: 'fa-user',
      manager: 'fa-crown',
      invited: 'fa-user-clock'
    },

    /// Human-readable descriptions of access levels.
    /// These are used in title attrs of membership icons and on Change Role buttons.
    accessNames: {
      reader: 'Member with read-only access',
      normal: 'Regular member with write access',
      manager: 'Group manager'
    },

    // All possible schema-id's
    schemaIDs: [],

    // Default schema id for this yoda instance coming from the backend
    schemaIdDefault: '',

    /// Get the name of an access level one lower than the current one for
    /// the given group.
    prevAccessLevel: function (current, groupName) {
      let prev = null
      const currentI = this.accessLevels.indexOf(current)
      if (currentI) { prev = this.accessLevels[currentI - 1] }

      if (prev === 'reader' && !groupName.match(/^(research|intake)-/) && current === 'normal') {
        // The reader access level is only defined for research and intake groups.
        prev = null
      }

      return prev
    },

    /// Get the name of an access level one higher than the current one for
    /// the given group.
    nextAccessLevel: function (current, groupName) {
      let next = null
      const currentI = this.accessLevels.indexOf(current)
      if (currentI + 1 < this.accessLevels.length) { next = this.accessLevels[currentI + 1] }
      return next
    },

    getPrefix: function (groupName) {
      const matches = groupName.match(this.GROUP_PREFIXES_RE, '')
      return matches
      // ? matches[1].slice(0, -1) // Chop off the '-' ?
        ? matches[1]
        : ''
    },

    prefixHasDataClassification: function (prefix) {
      return this.GROUP_PREFIXES_WITH_DATA_CLASSIFICATION.indexOf(prefix) >= 0
    },

    prefixHasSchemaId: function (prefix) {
      return this.GROUP_PREFIXES_WITH_SCHEMA_ID.indexOf(prefix) >= 0
    },

    prefixHasExpirationDate: function (prefix) {
      return this.GROUP_PREFIXES_WITH_EXPIRATION_DATE.indexOf(prefix) >= 0
    },

    // Functions that check membership / access status of the
    // client ('the user') {{{

    /**
         * \brief Check if the user is a member of the given group.
         *
         * \param groupName
         *
         * \return
         */
    isMemberOfGroup: function (groupName) {
      return (groupName in this.groups &&
                    this.userNameFull in this.groups[groupName].members)
    },

    /**
         * \brief Check if the user is a manager in the given group.
         *
         * \param groupName
         *
         * \return
         */
    isManagerOfGroup: function (groupName) {
      return (this.isMemberOfGroup(groupName) &&
                    (this.accessLevels.indexOf(this.groups[groupName]
                      .members[this.userNameFull].access) >=
                        this.accessLevels.indexOf('manager')))
    },

    /**
         * \brief Check if the user is allowed to manage the given group.
         *
         * If the user is of type rodsadmin, they do not need to be a
         * manager in the given group to manage it.
         *
         * \param groupName
         *
         * \return
         */
    canManageGroup: function (groupName) {
      return this.isRodsAdmin || this.isManagerOfGroup(groupName)
    },

    /**
         * \brief Try to check if the user is a manager in the given category.
         *
         * Returns false if the user does not have access to the given
         * category.
         *
         * rodsadmin type users are always a manager in any category.
         *
         * \param categoryName
         *
         * \return
         */
    isManagerInCategory: function (categoryName) {
      if (this.isRodsAdmin) { return true }

      const that = this
      try {
        const category = this.groupHierarchy[categoryName]
        return Object.keys(category).some(function (subcategoryName) {
          return Object.keys(category[subcategoryName]).some(function (groupName) {
            return that.isManagerOfGroup(groupName)
          })
        })
      } catch (ex) {
        // The category is probably not visible to us.
        return false
      }
    },

    /**
         * \brief Check whether the user is allowed to create the datamanager
         *        group in the given category.
         *
         * \param categoryName
         *
         * \return
         */
    canCreateDatamanagerGroup: function (categoryName) {
      return (// if the category name can legally be translated to a group name ...
        categoryName.match(/^([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/) &&
        // ... and the datamanager group DOES NOT yet exist ...
        !(('datamanager-' + categoryName) in this.groups) &&
        // ... then the user must either be rodsadmin ...
        (this.isRodsAdmin ||
        // ... or the user is in priv-*-add ...
        (this.userNameFull in this.groups['priv-category-add'].members &&
        this.userNameFull in this.groups['priv-group-add'].members &&
        // ... and the user must be a manager of at least one group in the category
        this.isManagerInCategory(categoryName))))

      // (previously, priv-category-add was sufficient where we now require rodsadmin in most cases)
    },

    /**
         * \brief Check whether the user is allowed to update the datamanager
         *        group in the given category.
         *
         * \param categoryName
         *
         * \return
         */
    canUpdateDatamanagerGroup: function (categoryName) {
      return (// if the category name can legally be translated to a group name ...
        categoryName.match(/^([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/) &&
        // ... and the datamanager group DOES exist ...
        (('datamanager-' + categoryName) in this.groups) &&
        // ... then the user must either be rodsadmin ...
        (this.isRodsAdmin ||
        // ... or the user is in priv-*-add ...
        (this.userNameFull in this.groups['priv-category-add'].members &&
        this.userNameFull in this.groups['priv-group-add'].members &&
        // ... and the user must be a manager of at least one group in the category
        this.isManagerInCategory(categoryName))))
    },

    // }}}

    /**
         * \brief Execute a function if an AJAX request was not aborted.
         *
         * This is used to inhibit error reporting when the cause of the error
         * was that the user aborted a request.
         *
         * \param result the request result object
         * \param f      the function to call
         */
    ifRequestNotAborted: function (result, f) {
      if (!this.unloading) {
        // Aborted requests are apparently hard to detect reliably.
        // The closest we can get is a detection of an abort caused by
        // navigation (e.g. refreshing the page):
        // https://stackoverflow.com/a/15141116
        //
        // Checking result.status is not sufficient, because we
        // cannot distinguish between aborted requests and network
        // failures.
        // The result.statusText can not be used because its behavior
        // differs between browsers(!), e.g. Firefox will set it to
        // 'error' either way.
        f()
      }
    },

    /**
         * \brief Unfold the category belonging to the given group in the group list.
         *
         * \param groupName
         */
    unfoldToGroup: function (groupName) {
      const $groupList = $('#group-list')

      const $group = $groupList.find('.group[data-name="' + Yoda.escapeQuotes(groupName) + '"]')

      const $catBody = $group.parents('.category').children('.category-ul')
      new bootstrap.Collapse($catBody, { toggle: false }).show()
      const numSubcats = $group.parents('.category').find('.subcategory').length

      if (numSubcats > 1) {
        // Unfold subcategory.
        // Skip this if there is only one subcategory. In that case the
        // subcat will be automagically expanded by a
        // 'shown.bs.collapse' event handler.
        // (unfolding twice looks jittery)
        const $subcatBody = $group.parents('.subcategory').children('.subcategory-ul')
        new bootstrap.Collapse($subcatBody, { toggle: false }).show()
      }
    },

    updateGroupMemberCount: function (groupName) {
      const countSelected = $('#user-list .active').length
      let selected = ''
      if (countSelected) {
        selected = ' / ' + countSelected.toString() + ' selected'
      }

      $('#user-group-member-count').text('Group members (' + Object.keys(this.groups[groupName].members).length + selected + ')')
    },

    /**
         * \brief Select the given group in the group list.
         *
         * \param groupName
         */
    selectGroup: function (groupName) {
      const group = this.groups[groupName]
      const categoryName = group.category
      const userCanManage = this.canManageGroup(groupName)

      // Tree
      const $groupList = $('#group-list')
      const $group = $groupList.find('.group[data-name="' + Yoda.escapeQuotes(groupName) + '"]')
      const $oldGroup = $groupList.find('.active')

      // group list handling row activation
      const listgroup = $('#tbl-list-groups tr[user-search-result-group="' + Yoda.escapeQuotes(groupName) + '"]')
      listgroup.addClass('table-active').siblings().removeClass('table-active')

      if ($group.is($oldGroup)) { return }

      this.deselectGroup()

      this.unfoldToGroup(groupName)

      // handle visibility of correct update cards.
      $('.properties-create').addClass('hidden')
      $('.properties-update').removeClass('hidden')
      $('.users').removeClass('hidden')

      const sanitizedGroupName = DOMPurify.sanitize('<strong>[' + groupName + ']</strong>')
      $('#group-properties-group-name').html(sanitizedGroupName)

      $oldGroup.removeClass('active')
      $group.addClass('active')
      Yoda.storage.session.set('selected-group', groupName)

      const that = this

      $('#group-properties .delete-button').toggleClass(
        'hidden',
        !(this.isRodsAdmin || (userCanManage && !(groupName.match(that.GROUP_PREFIXES_RESERVED_RE))) ||
                   (groupName.match(/^datamanager-/) && Yoda.canUpdateDatamanagerGroup(categoryName)))
      )

      // The category of a datamanager group cannot be changed - the
      // category name is part of the group name.
      const canEditCategory = userCanManage && !groupName.match(/^datamanager-/);

      // Build the group properties panel {{{

      (function () {
        const $groupProperties = $('#group-properties')

        $groupProperties.find('.placeholder-text').addClass('hidden')
        $groupProperties.find('form').removeClass('hidden')

        const defaultCategory = new Option(group.category, group.category, true, true)
        $groupProperties.find('#f-group-update-category')
          .append(defaultCategory).trigger('change')
          .prop('disabled', !canEditCategory)

        const defaultSubcategory = new Option(group.subcategory, group.subcategory, true, true)
        $groupProperties.find('#f-group-update-subcategory')
          .append(defaultSubcategory).trigger('change')
          .prop('disabled', !userCanManage)

        $groupProperties.find('#inputGroupPrepend')
          .html(function () {
            const matches = groupName.match(that.GROUP_PREFIXES_RE, '')
            return matches
              ? matches[1]
              : '&nbsp;&nbsp;'
          })

        const prefix = that.getPrefix(groupName)

        if (that.prefixHasSchemaId(prefix)) {
          $groupProperties.find('.schema-id').show()
          // For now this is a disabled field.
          $('#f-group-update-schema-id').val(group.schema_id)
        } else {
          $groupProperties.find('.schema-id').hide()
        }

        if (that.prefixHasExpirationDate(prefix)) {
          $groupProperties.find('.expiration-date').show()
          $groupProperties.find('#f-group-update-expiration-date')
            .val(group.expiration_date)
            .prop('readonly', !userCanManage)
        } else {
          $groupProperties.find('.expiration-date').hide()
        }

        $groupProperties.find('#f-group-update-name')
          .val(groupName.replace(that.GROUP_PREFIXES_RE, ''))
          .prop('readonly', true)
          .attr('title', 'Group names cannot be changed')
          .attr('data-prefix', prefix)
        $groupProperties.find('#f-group-update-description')
          .val(group.description)
          .prop('readonly', !userCanManage)

        // Creation date of this group
        $groupProperties.find('#f-group-update-creation-date')
          .val(group.creation_date)
          .prop('disabled', true)

        if (that.prefixHasDataClassification(prefix)) {
          $groupProperties.find('.data-classification').show()
          $('#f-group-update-data-classification')
            .prop('disabled', !userCanManage)
        } else {
          $groupProperties.find('.data-classification').hide()
          $('#f-group-update-data-classification').prop('disabled', true)
        }

        if (group.data_classification === null) {
          $('#f-group-update-data-classification')
            .val('unspecified').trigger('change')
        } else {
          $('#f-group-update-data-classification')
            .val(group.data_classification).trigger('change')
        }

        $groupProperties.find('#f-group-update-submit')
          .attr('hidden', !userCanManage)
      })()

      // }}}
      // Build the user list panel {{{

      that.updateGroupMemberCount(groupName);

      (function () {
        const users = that.groups[groupName].members

        const $userList = $('#user-list')
        $userList.find('.list-group-item.user').remove()

        Object.keys(users).slice().sort(function (a, b) {
          function cmp (a, b) {
            // For lack of a built-in '<=>' compare operator...
            return (a < b
              ? -1
              : a > b
                ? 1
                : 0)
          }

          // Sort based on access level first (more rights => higher in the list).
          return (cmp(that.accessLevels.indexOf(users[b].access),
            that.accessLevels.indexOf(users[a].access)) ||
                            // ... then sort alphabetically on username.
                            cmp(a, b))
        }).forEach(function (userName, i) {
          // Loop through the sorted user list and generate the #userList element.
          const user = users[userName]

          const $user = $('<span>')

          // Check if user is current user.
          let me = false
          if (userName === that.userNameFull) {
            me = true
            if (!that.isRodsAdmin) {
              $user.attr('data-bs-toggle', 'tooltip')
              $user.attr('data-bs-title', 'You cannot change your own role or remove yourself from this group')
            }
          }

          // Open SRAM invitation.
          let invited = false
          if (typeof user.sram !== 'undefined') {
            invited = true
            $user.attr('data-bs-toggle', 'tooltip')
            $user.attr('data-bs-title', 'This user has not accepted the SRAM invitation')
          }

          let displayName = userName
          const nameAndZone = userName.split('#')
          // Only display a user's zone if it differs
          // from the client's zone.
          if (nameAndZone[1] === that.zone) { displayName = nameAndZone[0] }

          $user.html('<a id="user-' + i + '" class="list-group-item list-group-item-action user user-access-' +
                     user.access + ((invited || me) ? ' disabled' : '') + (me ? ' self' : '') + '" data-name="' + userName + '">' +
                     '<input class="form-check-input" type="checkbox" value=""> <i class="fa-solid ' +
                     (invited ? that.accessIcons.invited : that.accessIcons[user.access]) +
                     '" aria-hidden="true" title="' +
                     that.accessNames[user.access] +
                     '"></i> ' +
                     Yoda.htmlEncode(displayName) +
                     '</a>')
          $userList.append($user)
        })

        // Move the user creation item to the bottom of the list.
        const $userList2 = $('#user-list-add-user')
        $userList2.find('#f-user-create-group').val(groupName)
        $userList2.attr('hidden', !that.canManageGroup(groupName))

        // Show or hide user actions depending on group permissions.
        const $userActions = $('#user-actions')
        $userActions.attr('hidden', !that.canManageGroup(groupName))

        const $userPanel = $('.card.users')
        $userPanel.find('#user-list').removeClass('hidden')
        $userPanel.find('.card-body:has(.placeholder-text)').addClass('hidden')

        // Fix bad bootstrap borders caused by hidden elements.
        $userPanel.find('.card-header').css({ borderBottom: 'none' })
        $userPanel.find('.card-footer').css({ borderTop: '' })

        $userPanel.find('.create-button').removeClass('disabled')
        $userPanel.find('.update-button, .delete-button').addClass('disabled')

        // Trigger tooltips.
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
        const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl)) // eslint-disable-line no-unused-vars
      })()

      // }}}
    },

    /**
         * \brief Deselects the selected group, if any.
         */
    deselectGroup: function () {
      this.deselectUser()

      const $groupPanel = $('.card.groups')
      $groupPanel.find('.delete-button').addClass('disabled')

      const $groupList = $('#group-list')
      $groupList.find('.active').removeClass('active')

      const $groupProperties = $('#group-properties')
      $groupProperties.find('.placeholder-text').removeClass('hidden')
      $groupProperties.find('form').addClass('hidden')

      const $userPanel = $('.card.users')

      const $panelTitle = $userPanel.find('.card-title')
      $panelTitle.text($panelTitle.text().replace(/\s*\(\d+\)$/, ''))

      $userPanel.find('#user-list-search').val('')
      $userPanel.find('.card-body:has(.placeholder-text)').removeClass('hidden')
      $userPanel.find('#user-list').addClass('hidden')

      // Fix bad bootstrap borders caused by hidden elements.
      $userPanel.find('.card-header').css({ borderBottom: '' })

      $userPanel.find('.card-footer').css({ borderTop: '1px solid #ddd' })

      $('#group-properties-group-name').html('')

      Yoda.storage.session.remove('selected-group')
    },

    /**
         * \brief Select the given user in the user list.
         *
         * \param item: the row that was clicked in the userlist
         */
    selectUser: function (item) {
      if (item.hasClass('active')) {
        item.removeClass('active')
        item.find('.form-check-input').prop('checked', false)
      } else {
        item.addClass('active')
        item.find('.form-check-input').prop('checked', true)
      }

      // inform users of member count and selection count
      this.updateGroupMemberCount($('#group-list .active.group').attr('data-name'))

      const countSelected = $('#user-list .active').length
      const $userPanel = $('.card.users')
      if (this.canManageGroup($('#group-list .active.group').attr('data-name'))) {
        if (countSelected > 0) {
          $userPanel.find('.delete-button').removeClass('disabled')
          $userPanel.find('.update-button').removeClass('disabled')
          return
        }
      }
      // Disable user management buttons
      $userPanel.find('.delete-button').addClass('disabled')
      $userPanel.find('.update-button').addClass('disabled')
    },

    /**
         * \brief Deselects the selected user, if any.
         */
    deselectUser: function () {
      const $userPanel = $('.card.users')
      const $userList = $('#user-list')
      $userList.find('.active').removeClass('active')
      $userPanel.find('.update-button, .delete-button').addClass('disabled')
    },

    /**
         * \brief Turn certain inputs into select2 inputs with autocompletion.
         */
    selectifyInputs: function (sel) {
      const that = this

      // Category fields {{{

      $(sel).filter('.selectify-category').each(function () {
        const $el = $(this)
        const placeholder = (that.isMemberOfGroup('priv-category-add') || that.isRodsAdmin)
          ? 'Select a category or enter a new name'
          : 'Select a category'

        $el.select2({
          placeholder,
          ajax: {
            delay: 200,
            url: '/group_manager/get_categories',
            type: 'post',
            dataType: 'json',
            data: function (params) {
              if (!params.term) {
                return { query: '' }
              } else {
                return { query: params.term }
              }
            },
            processResults: function (data, params) {
              const categories = data.categories
              const results = []
              let query = ''
              if (('term' in params) && params.term) {
                query = params.term
              }
              let inputMatches = false

              // For legacy reasons we allow selecting existing categories with illegal names.
              // New categories (where we show '(create)' in the dropdown) must adhere to the new rules:
              // They must be valid as part of a group name -> only lowercase letters, numbers and hyphens.
              //
              // When we drop support for the old category name style this code can be updated to
              // automatically lowercase user input (see the username input code for an example).

              categories.forEach(function (category) {
                if (query === category) { inputMatches = true }

                if (that.isManagerInCategory(category)) {
                  results.push({
                    id: category,
                    text: category
                  })
                } else if (inputMatches) {
                  // Only show a (disabled) category the user doesn't have access to
                  // if they type its exact name.
                  results.push({
                    id: category,
                    text: category,
                    disabled: true
                  })
                }
              })

              results.sort(function (a, b) {
                return (a.id === b.id
                  ? 0
                  : a.id === query
                    ? -1
                    : b.id === query
                      ? 1
                      : a.id >= b.id ? 1 : -1)
              })

              if (
                !inputMatches &&
                                query.length &&
                                (that.isMemberOfGroup('priv-category-add') || that.isRodsAdmin)
              ) {
                results.push({
                  id: query,
                  text: query,
                  exists: false
                })
              }

              return { results }
            }
          },
          templateResult: function (result) {
            return $('<span>' + jQuery.fn.select2.defaults.defaults.escapeMarkup(result.text) +
                            (
                              'exists' in result && !result.exists
                                ? ' <span class="grey">(create)</span>'
                                : ''
                            ) +
                            '</span>')
          }
        }).on('select2:open', function () {
          // Clear selected category on open
          $(this).val(null)
          // $(this).val(null).trigger('change')
        }).on('change', function () {
          // Reset the subcategory value
          const sanitizedSubCategory = DOMPurify.sanitize($(this).attr('data-subcategory'))
          $(sanitizedSubCategory).val(null).trigger('change')

          // bring over the category value to the schema-id if exists.
          if (that.schemaIDs.includes($(this).select2('data')[0].id)) {
            $('#f-group-create-schema-id').val($(this).select2('data')[0].id).trigger('change')
          }

          if (this.id === 'f-group-create-category') {
            if (that.canCreateDatamanagerGroup(this.value)) {
              $('#f-group-create-prefix-datamanager').removeClass('hidden')
            } else {
              $('#f-group-create-prefix-datamanager').addClass('hidden')
            }

            if ($('#f-group-create-name').attr('data-prefix') === 'datamanager-') {
              // Reset the group name + prefix by pretending that
              // the user clicked on the default prefix.
              $('#f-group-create-prefix-div a[data-value="' + that.GROUP_DEFAULT_PREFIX + '"]').click()
              $('#f-group-create-name').val('')
            }
          }
        })
      })

      // }}}
      // Subcategory fields {{{

      $(sel).filter('.selectify-subcategory').each(function () {
        const $el = $(this)

        const sanitizedCategory = DOMPurify.sanitize($el.attr('data-category'))

        $el.select2({
          placeholder: 'Select a subcategory or enter a new name',
          ajax: {
            delay: 200,
            url: '/group_manager/get_subcategories',
            type: 'post',
            dataType: 'json',
            data: function (params) {
              const request = {
                query: '',
                category: $(sanitizedCategory).val()
              }
              if (params.term) {
                request.query = params.term
              }
              return request
            },
            processResults: function (data, params) {
              const subcategories = data.subcategories
              const results = []
              let query = ''
              if (('term' in params) && params.term) {
                query = params.term
              }
              let inputMatches = false

              subcategories.forEach(function (subcategory) {
                results.push({
                  id: subcategory,
                  text: subcategory
                })
                if (query === subcategory) { inputMatches = true }
              })

              results.sort(function (a, b) {
                return (a.id === b.id
                  ? 0
                  : a.id === query
                    ? -1
                    : b.id === query
                      ? 1
                      : a.id >= b.id ? 1 : -1)
              })

              if (!inputMatches && query.length) {
                results.push({
                  id: query,
                  text: query,
                  exists: false
                })
              }

              return { results }
            }
          },
          templateResult: function (result) {
            return $('<span>' + jQuery.fn.select2.defaults.defaults.escapeMarkup(result.text) +
                            (
                              'exists' in result && !result.exists
                                ? ' <span class="grey">(create)</span>'
                                : ''
                            ) +
                            '</span>')
          }
        }).on('select2:open', function () {
          $(this).val(null)
        })
      })

      // }}}

      // Schema-id {{{
      $(sel).filter('.selectify-schema-id').each(function () {
        const $el = $(this)

        $el.select2({
          ajax: {
            placeholder: 'Select a schema',
            delay: 200,
            url: '/group_manager/get_schemas',
            type: 'post',
            dataType: 'json',
            data: function (params) {
              if (!params.term) {
                return { query: '' }
              } else {
                return { query: params.term }
              }
            },
            processResults: function (data, params) {
              const schemas = data.schemas
              const results = []
              let query = ''
              if (('term' in params) && params.term) {
                query = params.term
              }

              schemas.forEach(function (schema) {
                if (schema.startsWith(query)) {
                  results.push({
                    id: schema,
                    text: schema
                  })
                }
              })

              results.sort(function (a, b) {
                return (a.id === b.id
                  ? 0
                  : a.id === query
                    ? -1
                    : b.id === query
                      ? 1
                      : a.id >= b.id ? 1 : -1)
              })

              return { results }
            }
          },
          templateResult: function (result) {
            return $('<span>' + jQuery.fn.select2.defaults.defaults.escapeMarkup(result.text) +
                            (
                              'exists' in result && !result.exists
                                ? ' <span class="grey">(create)</span>'
                                : ''
                            ) +
                            '</span>')
          }
        }).on('select2:open', function () {
          $(this).val(null)
        }).on('change', function () {
        })
      })

      // }}}

      // Username fields {{{
      $(sel).filter('.selectify-user-name').each(function () {
        const $el = $(this)

        $el.select2({
          allowClear: true,
          placeholder: 'Click here to add a user...',
          minimumInputLength: 3,
          tags: true,
          ajax: {
            delay: 400,
            url: '/group_manager/get_users',
            type: 'post',
            dataType: 'json',
            data: function (params) {
              if (!params.term) {
                return { query: '' }
              } else {
                return { query: params.term.toLowerCase() }
              }
            },
            processResults: function (data, params) {
              const users = data.users
              let query = ''
              const results = []
              let inputMatches = false
              if (('term' in params) && params.term) {
                query = params.term.toLowerCase()
              }

              users.forEach(function (userName) {
                // Exclude users already in the group.
                const sanitizedGroup = DOMPurify.sanitize($el.attr('data-group'))
                if (!(userName in that.groups[$(sanitizedGroup).val()].members)) {
                  const nameAndZone = userName.split('#')
                  results.push({
                    id: userName,
                    text: nameAndZone[1] === that.zone ? nameAndZone[0] : userName
                  })
                }
                if (query === userName || query + '#' + that.zone === userName) { inputMatches = true }
              })

              if (!inputMatches && query.length) {
                results.push({
                  id: query,
                  text: query,
                  exists: false
                })
              }

              if (results.length === 1) {
                enteredUsername = results[0].id
                $('#select2-f-user-create-name-container').text(enteredUsername)
              }

              return { results }
            }
          },
          templateResult: function (result) {
            return $('<span>' + jQuery.fn.select2.defaults.defaults.escapeMarkup(result.text) +
                            (
                              'exists' in result && !result.exists
                                ? ' <span class="grey">(create)</span>'
                                : ''
                            ) +
                            '</span>')
          }
        })
      })

      // }}}

      // Search username field {{{
      $(sel).filter('.selectify-search').each(function () {
        // Build array with co-members to be used by select2.
        const hier = Yoda.groupManager.groupHierarchy

        const usernames = []
        const groupnames = []
        for (const categoryName in hier) {
          for (const subcategoryName in hier[categoryName]) {
            for (const groupName in hier[categoryName][subcategoryName]) {
              groupnames.push(groupName)
              // find the user within the group array
              for (const mem in hier[categoryName][subcategoryName][groupName].members) {
                usernames.push(mem)
              }
            }
          }
        }

        // only unique usernames
        const uniqueUsers = [...new Set(usernames)]
        uniqueUsers.sort()
        const userList = []
        for (const val in uniqueUsers) {
          userList.push({ id: 'user:' + uniqueUsers[val], text: uniqueUsers[val].split('#')[0] })
        }

        // only unique group names
        const uniqueGroups = [...new Set(groupnames)]
        uniqueGroups.sort()
        const groupList = []
        for (const val in uniqueGroups) {
          groupList.push({ id: 'group:' + uniqueGroups[val], text: uniqueGroups[val] })
        }

        const data = [{ text: 'Groups', children: groupList }, { text: 'Users', children: userList }]

        // Initialize Select2.
        const $el = $(this)
        $el.select2({
          data,
          placeholder: 'Click here to search...',
          allowClear: true,
          openOnEnter: false,
          minimumInputLength: 3,
          width: 'element'
        }).on('select2:open', function () {
          $(this).val(null)
        }).on('change', function () {
          treeListGroups()
          flatListGroups()
        })
      })

      // }}}
    },

    /**
         * \brief Group create / update form submission handler.
         *
         * `this` is assumed to be the groupManager object, not the form element
         * that was submitted.
         *
         * \param button the button that determines updating or creation of group data
         */
    onSubmitGroupCreateOrUpdate: function (button) {
      const action =
                $(button).attr('id') === 'f-group-create-submit'
                  ? 'create'
                  : 'update'

      // eslint-disable-next-line camelcase
      const schema_id =
        (action === 'create')
          ? $('#f-group-' + action + '-schema-id').select2('data')[0].id
          : $('#f-group-' + action + '-schema-id').val()

      // eslint-disable-next-line camelcase
      const data_classification =
        $('#f-group-' + action + '-data-classification').select2('data').length
          ? $('#f-group-' + action + '-data-classification').select2('data')[0].id
          : ''

      $(button).addClass('disabled').val(
        action === 'create'
          ? 'Adding group...'
          : 'Updating...'
      )

      function resetSubmitButton () {
        $(button).removeClass('disabled')
          .val(
            action === 'create'
              ? 'Add group'
              : 'Update'
          )
      }

      // all now based upon update-fields. Create dialog is discarded
      const newProperties = {
        name: $('#f-group-' + action + '-name').attr('data-prefix') +
                                   $('#f-group-' + action + '-name').val(),
        description: $('#f-group-' + action + '-description').val(),
        // eslint-disable-next-line camelcase
        schema_id,
        // eslint-disable-next-line camelcase
        data_classification,
        category: $('#f-group-' + action + '-category').select2('data')[0].id,
        subcategory: $('#f-group-' + action + '-subcategory').select2('data')[0].id,
        expiration_date: $('#f-group-' + action + '-expiration-date').val()
      }

      // specific datamanager-group testing dependent on mode
      if (newProperties.name.startsWith('datamanager-')) {
        if (action === 'create') {
          if (!this.canCreateDatamanagerGroup(newProperties.category)) {
            window.alert('Datamanager group names may only contain lowercase letters (a-z) and hyphens (-).')
            resetSubmitButton()
            return
          }
        } else if (action === 'update') {
          if (!this.canUpdateDatamanagerGroup(newProperties.category)) {
            window.alert('Insufficient permissions to update this datamanager group.')
            resetSubmitButton()
            return
          }
        }
      }

      if (!newProperties.name.startsWith('datamanager-') && !newProperties.name.match(/^(intake|research|deposit)-([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/)) {
        window.alert('Group names may only contain lowercase letters (a-z) and hyphens (-).')
        resetSubmitButton()
        return
      }

      // Check if category is valid.
      if (newProperties.category === '') {
        window.alert('Please select a category.')
        resetSubmitButton()
        return
      } else if (!newProperties.category.match(/^([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/)) {
        window.alert('The category name may only contain lowercase letters (a-z) and hyphens (-).')
        resetSubmitButton()
        return
      }

      // Check if subcategory is valid.
      if (newProperties.subcategory === '') {
        window.alert('Please select a subcategory.')
        resetSubmitButton()
        return
      } else if (!newProperties.subcategory.match(/^[a-zA-Z0-9,.()_ -]*$/)) {
        window.alert('The subcategory name may only contain letters a-z, numbers, spaces, comma\'s, periods, parentheses, underscores (_) and hyphens (-).')
        resetSubmitButton()
        return
      }

      // Check if schema id is valid.
      if (this.prefixHasSchemaId(this.getPrefix(newProperties.name)) && !this.schemaIDs.includes(newProperties.schema_id)) {
        window.alert('Please select a valid metadata schema as it is a required field.')
        resetSubmitButton()
        return
      }

      // Check if group expiration date is valid.
      if ($('#f-group-' + action + '-expiration-date').val().length) {
        const today = new Date().toISOString().substring(0, 10)
        let expirationDate = new Date()
        const parts = $('#f-group-' + action + '-expiration-date').val().split('-')
        expirationDate.setYear(parts[0])
        expirationDate.setMonth(parts[1] - 1)
        expirationDate.setDate(parts[2])
        expirationDate = expirationDate.toISOString().substring(0, 10)

        if (expirationDate <= today) {
          window.alert('Expiration date needs to be in the future')
          resetSubmitButton()
          return
        }
      }

      // Check if group description is valid.
      if (!newProperties.description.match(/^[a-zA-Z0-9,.()_ -]*$/)) {
        window.alert('The group description may only contain letters a-z, numbers, spaces, comma\'s, periods, parentheses, underscores (_) and hyphens (-).')
        resetSubmitButton()
        return
      }

      const postData = {
        group_name: newProperties.name,
        group_description: newProperties.description,
        group_schema_id: newProperties.schema_id,
        group_expiration_date: newProperties.expiration_date,
        group_data_classification: newProperties.data_classification,
        group_category: newProperties.category,
        group_subcategory: newProperties.subcategory
      }

      // Avoid trying to set a schema id for groups that
      // can't have one.
      if (!this.prefixHasSchemaId(this.getPrefix(newProperties.name))) { delete postData.group_schema_id }

      if (action === 'update') {
        const selectedGroup = this.groups[$($('#group-list .group.active')[0]).attr('data-name')];
        ['description',
          'data_classification',
          'expiration_date',
          'category',
          'subcategory'].forEach(function (item) {
          // Filter out fields that have not changed.
          if (selectedGroup[item] === newProperties[item]) { delete postData['group_' + item] }
        })
      }

      const that = this

      // Avoid trying to set/update a data classification for groups that
      // can't have one.
      if (!this.prefixHasDataClassification(this.getPrefix(newProperties.name))) { delete postData.group_data_classification }

      // Avoid trying to set/update a expiration date for groups that
      // can't have one.
      if (!this.prefixHasExpirationDate(this.getPrefix(newProperties.name))) { delete postData.group_expiration_date }

      $.ajax({
        url: $(button).attr('action'),
        type: 'post',
        dataType: 'json',
        data: postData
      }).done(function (result) {
        if ('status' in result && result.status === 0) {
          // OK! Make sure the newly added group is selected after reloading the page.
          Yoda.storage.session.set('selected-group', postData.group_name)

          // And give the user some feedback.
          Yoda.storage.session.set('messages',
            Yoda.storage.session.get('messages', []).concat({
              type: 'success',
              message: action === 'create'
                ? 'Created group ' + postData.group_name + '.'
                : 'Updated ' + postData.group_name + ' group properties.'
            })
          )

          $(window).on('beforeunload', function () {
            $(window).scrollTop(0)
          })
          window.location.reload(true)
        } else {
          // Something went wrong.
          resetSubmitButton()

          if ('message' in result) {
            window.alert(result.message)
          } else {
            window.alert(
              'Error: Could not ' + action + ' group due to an internal error.\n' +
                            'Please contact a Yoda administrator'
            )
          }
        }
      }).fail(function (result) {
        that.ifRequestNotAborted(result, function () {
          window.alert('Error: Could not ' + action + ' group due to an internal error.\nPlease contact a Yoda administrator')
          resetSubmitButton()
        })
      })
    },

    /**
         * \brief Handle a group delete button click event.
         */
    onClickGroupDelete: function (el) {
      const groupName = $('#group-list .group.active').attr('data-name')
      const nextGroupName = $('#result-user-search-groups .user-search-result-group.table-active').next().attr('user-search-result-group')

      $('#group-list .group.active')
        .addClass('delete-pending disabled')
        .attr('title', 'Removal pending')
      this.deselectGroup()

      const that = this

      $.ajax({
        url: $(el).attr('data-action'),
        type: 'post',
        dataType: 'json',
        data: {
          group_name: groupName
        }
      }).done(function (result) {
        if ('status' in result && result.status === 0) {
          // Give the user some feedback.
          Yoda.storage.session.set('messages',
            Yoda.storage.session.get('messages', []).concat({
              type: 'success',
              message: 'Removed group ' + groupName + '.'
            })
          )

          if (nextGroupName) {
            Yoda.storage.session.set('selected-group', nextGroupName)
          }

          $(window).on('beforeunload', function () {
            $(window).scrollTop(0)
          })
          window.location.reload(true)
        } else {
          // Something went wrong.

          // Re-enable group list entry.
          $('#group-list .group.delete-pending[data-name="' + Yoda.escapeQuotes(groupName) + '"]').removeClass('delete-pending disabled').attr('title', '')

          if ('message' in result) { window.alert(result.message) } else {
            window.alert(
              'Error: Could not remove the selected group due to an internal error.\n' +
                            'Please contact a Yoda administrator'
            )
          }
        }
      }).fail(function (result) {
        that.ifRequestNotAborted(result, function () {
          window.alert('Error: Could not remove the selected group due to an internal error.\nPlease contact a Yoda administrator')
        })
      })
    },

    /**
         * \brief User add form submission handler.
         *
         * Adds a user to the selected group.
         *
         * `this` is assumed to be the groupManager object, not the form element
         * that was submitted.
         *
         * \param el the form element
         * \param e  a submit event
         */
    onSubmitUserCreate: function (el, e) {
      e.preventDefault()

      if ($(el).find('input[type="submit"]').hasClass('disabled')) { return }

      const groupName = $(el).find('#f-user-create-group').val()
      let userName = $(el).find('#f-user-create-name').find(':selected').val().trim()
      if (enteredUsername.length > 0 && (enteredUsername.startsWith(userName) || userName.startsWith(enteredUsername))) {
        userName = enteredUsername
      }

      if (!userName.match(/^([a-z.]+|[a-z0-9_.-]+@[a-z0-9_.-]+)(#[a-zA-Z0-9_-]+)?$/)) {
        window.alert('Please enter either an e-mail address or a name consisting only of lowercase chars and dots.')
        return
      }

      const onlyUserName = userName.indexOf('#') > -1 ? userName.split('#')[0] : userName
      if (onlyUserName.length > 63) {
        window.alert('Please enter a shorter username.')
        return
      }

      $(el).find('input[type="submit"]').addClass('disabled').val('Adding...')

      const that = this

      $.ajax({
        url: $(el).attr('action'),
        type: 'post',
        dataType: 'json',
        data: {
          group_name: groupName,
          user_name: userName
        }
      }).done(function (result) {
        if ('status' in result) { console.log('User add completed with status ' + result.status) }
        if ('status' in result && result.status === 0) {
          that.groups[groupName].members[userName] = {
            // XXX
            access: 'normal'
          }

          $(el).find('#f-user-create-name').val(null).trigger('change')

          that.deselectGroup()
          that.selectGroup(groupName)

          const $userList = $('#user-list')
          const $user = $userList.find('.user[data-name="' + Yoda.escapeQuotes(userName) + '"]')

          // that.selectUser(userName);
          that.selectUser($user)

          // Give a visual hint that the user was added.
          $('#user-list .user[data-name="' + Yoda.escapeQuotes(userName) + '"]')[0].scrollIntoView({
            block: 'center',
            behavior: 'smooth'
          })
          $('#user-list .user[data-name="' + Yoda.escapeQuotes(userName) + '"]').addClass('blink-once')

          // open the select-user select2 for ease of use
          $('.selectify-user-name').trigger('select2:open')
        } else {
          // Something went wrong. :(
          if ('message' in result) { window.alert(result.message) } else {
            window.alert(
              'Error: Could not add a member due to an internal error.\n' +
                            'Please contact a Yoda administrator'
            )
          }
        }
        $(el).find('input[type="submit"]').removeClass('disabled').val('Add')
      }).fail(function (result) {
        that.ifRequestNotAborted(result, function () {
          window.alert('Error: Could not add a member due to an internal error.\nPlease contact a Yoda administrator')
          $(el).find('input[type="submit"]').removeClass('disabled').val('Add')
        })
      })
    },

    /**
         * \brief Handle a change role button click event.
         *
         * `this` is assumed to be the groupManager object, not the form element
         * that was submitted.
         *
         * \param el
         * \param e
         */
    onClickUserUpdate: function (el, e) {
      const that = this

      const groupName = $('#group-list .group.active').attr('data-name')
      const userName = $('#user-list   .user.active').attr('data-name')

      $('#user-list .user.active')
        .addClass('update-pending disabled')
        .attr('title', 'Update pending')

      // Get the new role name from the button element before we deselect the user.
      const newRole = $(el).attr('data-target-role')

      this.deselectUser()

      $.ajax({
        url: $(el).attr('data-action'),
        type: 'post',
        dataType: 'json',
        data: {
          group_name: groupName,
          user_name: userName,
          new_role: newRole
        }
      }).done(function (result) {
        if ('status' in result) { console.log('User update completed with status ' + result.status) }
        if ('status' in result && result.status === 0) {
          // Update user role.
          that.groups[groupName].members[userName].access = newRole

          // Force-regenerate the user list.
          that.deselectGroup()
          that.selectGroup(groupName)

          // Give a visual hint that the user was updated.
          $('#user-list .user[data-name="' + Yoda.escapeQuotes(userName) + '"]').addClass('blink-once')
        } else {
          // Something went wrong. :(

          $('#user-list .user.update-pending[data-name="' + Yoda.escapeQuotes(userName) + '"]')
            .removeClass('update-pending disabled')
            .attr('title', '')

          if ('message' in result) { window.alert(result.message) } else {
            window.alert(
              'Error: Could not change the role for the selected member due to an internal error.\n' +
                            'Please contact a Yoda administrator'
            )
          }
        }
      }).fail(function (result) {
        that.ifRequestNotAborted(result, function () {
          window.alert('Error: Could not change the role for the selected member due to an internal error.\nPlease contact a Yoda administrator')
        })
      })
    },

    /**
         * \brief Initialize the group manager module.
         *
         * The structure of the groupHierarchy parameter is as follows:
         *
         *     {
         *       'CATEGORY_NAME': {
         *         'SUBCATEGORY_NAME': {
         *           'GROUP_NAME': {
         *             'description': 'GROUP_DESCRIPTION',
         *             'data-classification': 'GROUP_DATA_CLASSIFICATION',
         *             'members': {
         *               'USER_NAME': {
         *                 'access': (reader | normal | manager)
         *               }, ...
         *             }
         *           }, ...
         *         }, ...
         *       }, ...
         *     }
         *
         * \param groupHierarchy An object representing the category / group hierarchy visible to the user.
         *
         * \todo Generate the group list in JS just like the user list.
         */
    load: function (groupHierarchy, schemaIDs, schemaIdDefault, userType, userZone) {
      this.groupHierarchy = groupHierarchy
      this.schemaIDs = schemaIDs
      this.schemaIdDefault = schemaIdDefault
      this.isRodsAdmin = userType === 'rodsadmin'
      this.zone = userZone
      this.userNameFull = Yoda.user.username + '#' + userZone
      this.groups = (function (hier) {
        // Create a flat group map based on the hierarchy object.
        const groups = { }
        for (const categoryName in hier) {
          for (const subcategoryName in hier[categoryName]) {
            for (const groupName in hier[categoryName][subcategoryName]) {
              groups[groupName] = {
                category: categoryName,
                subcategory: subcategoryName,
                name: groupName,
                creation_date: hier[categoryName][subcategoryName][groupName].creation_date,
                description: hier[categoryName][subcategoryName][groupName].description,
                schema_id: hier[categoryName][subcategoryName][groupName].schema_id,
                expiration_date: hier[categoryName][subcategoryName][groupName].expiration_date,
                data_classification: hier[categoryName][subcategoryName][groupName].data_classification,
                members: hier[categoryName][subcategoryName][groupName].members
              }
            }
          }
        }
        return groups
      })(this.groupHierarchy)

      // Unfiltered flattened group list
      flatListGroups()

      const that = this
      const $groupList = $('#group-list')

      // Setting the Select2 default theme
      $.fn.select2.defaults.set('theme', 'bootstrap-5')

      // Attach event handlers {{{
      // Generic {{{

      $(document).ajaxSend(function (e, request, settings) {
        // Append a CSRF token to all AJAX POST requests.
        if (settings.type === 'POST' && settings.data.length) {
          settings.data +=
                        '&' + encodeURIComponent(Yoda.csrf.tokenName) +
                         '=' + encodeURIComponent(Yoda.csrf.tokenValue)
        }
      })
      // }}}

      // Set initial state of group create button {{{
      if (this.isMemberOfGroup('priv-group-add') || this.isRodsAdmin) {
        $('.div-show-search-groups').removeClass('d-none')
      } else {
        $('.div-show-search-groups').addClass('d-none')
        $('#group-manager-text').appendTo('#group-manager-no-add')
      }
      // }}}

      // Group properties {{{
      // When user collapses group properties
      $('.properties-update').on('hide.bs.collapse', function (e) {
        $('#properties-update-link').find('.triangle')
          .removeClass('fa-caret-down')
          .addClass('fa-caret-right')
        Yoda.storage.session.set('is-collapsed', 'true')
      })

      // When user opens group properties
      $('.properties-update').on('show.bs.collapse', function (e) {
        $('#properties-update-link').find('.triangle')
          .removeClass('fa-caret-right')
          .addClass('fa-caret-down')
        Yoda.storage.session.set('is-collapsed', 'false')
      })

      // For the auto-collapsing of group properties
      $(window).scroll(function (event) {
        didScroll = true
      })
      // }}}

      // Group list {{{

      $groupList.on('show.bs.collapse', function (e) {
        $(e.target).parent('.list-group-item').find('.triangle').first()
          .removeClass('fa-caret-right')
          .addClass('fa-caret-down')
      })

      $groupList.on('shown.bs.collapse', function (e) {
        // Once a category is fully opened, open its subcategory (if there is only one).
        const $subs = $(e.target).children('.subcategory')

        if ($subs.length === 1) {
          // Only one subcategory, expand it automatically.
          const $subcatBody = $subs.first().children('.subcategory-ul')
          new bootstrap.Collapse($subcatBody, { toggle: false }).show()
        }
      })

      $groupList.on('hide.bs.collapse', function (e) {
        $(e.target).parent('.list-group-item').find('.triangle').first()
          .removeClass('fa-caret-down')
          .addClass('fa-caret-right')
      })

      $groupList.on('click', 'a.group', function () {
        if ($(this).is($groupList.find('.active'))) { that.deselectGroup() } else { that.selectGroup($(this).attr('data-name')) }
      })

      // Search for groups.
      $('#search-group').on('keyup', function () {
        treeListGroups()
        flatListGroups()
      })

      // Group creation {{{
      $('#f-group-create-prefix-div a').on('click', function (e) {
        // Select new group prefix.
        const newPrefix = DOMPurify.sanitize($(this).attr('data-value'))
        const oldPrefix = $('#f-group-create-name').attr('data-prefix')
        $('#f-group-create-prefix-div button .text').html(newPrefix + '&nbsp;')
        $('#f-group-create-name').attr('data-prefix', newPrefix)

        if (newPrefix === 'datamanager-') {
          // Autofill the group name - the user cannot customize the
          // name of a datamanager group.
          $('#f-group-create-name').val($('#f-group-create-category').val())
          $('#f-group-create-name').prop('readonly', true)
        } else {
          $('#f-group-create-name').prop('readonly', false)
        }

        const hadDataClass = that.prefixHasDataClassification(oldPrefix)
        const haveDataClass = that.prefixHasDataClassification(newPrefix)

        if (hadDataClass !== haveDataClass) {
          if (haveDataClass) {
            $('.data-classification').show()
            $('#f-group-create-data-classification').val('unspecified').trigger('change')
          } else {
            $('.data-classification').hide()
          }
        }

        const hadSchemaId = that.prefixHasSchemaId(oldPrefix)
        const haveSchemaId = that.prefixHasSchemaId(newPrefix)

        if (hadSchemaId !== haveSchemaId) {
          if (haveSchemaId) {
            $('.schema-id').show()
          } else {
            $('.schema-id').hide()
          }
        }

        const hadRetentionPeriod = that.prefixHasExpirationDate(oldPrefix)
        const haveRetentionPeriod = that.prefixHasExpirationDate(newPrefix)

        if (hadRetentionPeriod !== haveRetentionPeriod) {
          if (haveRetentionPeriod) {
            $('.expiration-date').show()
          } else {
            $('.expiration-date').hide()
          }
        }

        e.preventDefault()
      })

      // Only rodsadmin can select the 'grp-' prefix.
      if (!this.isRodsAdmin) { $('#f-group-create-prefix-grp').addClass('hidden') }

      // Group removal.
      $('#modal-group-delete .confirm').on('click', function (e) {
        that.onClickGroupDelete($('.card.properties-update .delete-button')[0])
        $('#modal-group-delete').modal('hide')
      })

      $('#modal-group-delete').on('show.bs.modal', function () {
        const groupName = $('#group-list .group.active').attr('data-name')
        $(this).find('.group').text(groupName)
      })

      // }}}
      // }}}
      // User list {{{
      const $userList = $('#user-list')
      $userList.on('click', 'a.user:not(.disabled)', function () {
        that.selectUser($(this))
      })

      $userList.on('click', '.list-group-item:has(.user-create-text:not(.hidden))', function () {
        // Show the user add form.
        that.deselectUser()
        $(this).find('.user-create-text').attr('hidden', '')
        $(this).find('form').removeClass('hidden')
        $(this).find('form').find('#f-user-create-name').trigger('select2:open')
      })

      $('#f-user-create-name').on('select2:close', function () {
        // Remove the new user name input on unfocus if nothing was entered.
        if ($(this).find(':selected').val().length === 0) {
          $(this).parents('.list-group-item').find('.user-create-text').removeAttr('hidden')
        }
      })

      // Adding users to groups.
      $('#f-user-create').on('submit', function (e) {
        that.onSubmitUserCreate(this, e)
      })

      $('#f-user-create').on('keydown', function (e) {
        // Enter key.
        if (e.which === 13) {
          that.onSubmitUserCreate(this, e)
        }
      })

      // User list search.
      $('#user-list-search').on('keyup', function () {
        const $users = $('.card.users .user')

        if ($(this).val().length) {
          const quotedVal = Yoda.escapeQuotes($(this).val().toLowerCase())
          $users.filter('.filtered[data-name*="' + quotedVal + '"]').removeClass('filtered')
          $users.filter(':not(.filtered):not([data-name*="' + quotedVal + '"])').addClass('filtered')
        } else {
          $users.removeClass('filtered')
        }
      })

      // }}}
      // }}}

      this.selectifyInputs('.selectify-category, .selectify-subcategory, .selectify-schema-id, .selectify-user-name, .selectify-search')
      $('.selectify-data-classification').select2()

      if (this.isMemberOfGroup('priv-group-add') || this.isRodsAdmin) {
        const $groupPanel = $('.card.groups')
        $groupPanel.find('.create-button').removeClass('disabled')
      }

      let a = ''
      // Indicate which groups are managed by this user.
      for (const groupName in this.groups) {
        a = '<table class="float-end"><tr>'

        if (groupName.match(/^(research)-/)) {
          a += '<td><a href="/research/?dir=' + encodeURIComponent('/' + groupName) + '" title="Go to group ' + groupName + ' in research space"><i class="fa-regular fa-folder"></i></a></td>'
        }

        if (this.isManagerOfGroup(groupName)) {
          $('#group-list .group[data-name="' + Yoda.escapeQuotes(groupName) + '"]').append(
            a + '<td>&nbsp;<i class="fa fa-crown mt-1" title="You manage this group"></i>' + '</td></tr></table>'
          )
        } else if (!this.isMemberOfGroup(groupName) && this.isRodsAdmin) {
          $('#group-list .group[data-name="' + Yoda.escapeQuotes(groupName) + '"]').append(
            a + '<td>&nbsp;<i class="fa-solid fa-wrench mt-1" title="You are not a member of this group, but you can manage it as an iRODS administrator"></i>' + '</td></tr></table>'
          )
        } else if (this.isMemberOfGroup(groupName) && this.groups[groupName].members[this.userNameFull].access === 'reader') {
          $('#group-list .group[data-name="' + Yoda.escapeQuotes(groupName) + '"]').append(
            a + '<td>&nbsp;<i class="fa-solid fa-eye mt-1" title="You have read access to this group"></i>' + '</td></tr></table>'
          )
        } else {
          $('#group-list .group[data-name="' + Yoda.escapeQuotes(groupName) + '"]').append(
            a + '<td style="width: 26px;"></td></tr></table>'
          )
        }
      }

      const isCollapsed = Yoda.storage.session.get('is-collapsed')
      if (isCollapsed !== null && isCollapsed === 'true') {
        $('.collapsible-group-properties').removeClass('show')
        // Make sure the triangle is facing the correct direction
        $('.properties-update').find('.triangle')
          .removeClass('fa-caret-down')
          .addClass('fa-caret-right')
      }

      const selectedGroup = Yoda.storage.session.get('selected-group')
      if (selectedGroup !== null && selectedGroup in this.groups) {
        // Automatically select the last selected group within this session (bound to this tab).
        this.selectGroup(selectedGroup)
      }

      if (Object.keys(this.groups).length < this.CATEGORY_FOLD_THRESHOLD) {
        // Unfold all categories containing non-priv groups if the user has access to less than
        // CATEGORY_FOLD_THRESHOLD groups.
        for (const groupName in this.groups) {
          if (!groupName.match(/^priv-/)) { this.unfoldToGroup(groupName) }
        }
      } else {
        // When the user can only access a single category, unfold it automatically.
        const $categoryEls = $('#group-list .category')
        if ($categoryEls.length === 1) { this.unfoldToGroup($categoryEls.find('.group').attr('data-name')) }
      }

      $(window).on('beforeunload', function () {
        that.unloading = true
      })
    }

  }
})
