;(async () => {
  class PrismicApiHelper {
    customTypes = {}
    documents = {}

    getRepoName() {
      const repoName = window.location.hostname.split('.')[0]

      return repoName
    }

    getPageId() {
      const pageId = window.location.pathname.split('/').pop()

      return pageId
    }

    async setRepoInChromeStorage() {
      const repoName = this.getRepoName()
      const data = await chrome.storage.local.get('apiKeys')

      chrome.storage.local.set({
        apiKeys: {
          ...data.apiKeys,
          [repoName]: null,
        },
      })
    }

    async getApiKey() {
      const repoName = this.getRepoName()
      const { apiKeys } = await chrome.storage.local.get('apiKeys')

      return apiKeys[repoName]
    }

    async getPageCustomType() {
      const repoName = this.getRepoName()
      const pageId = this.getPageId()

      if (this.customTypes[pageId]) {
        return this.customTypes[pageId]
      }

      const request = await fetch(
        `https://${repoName}.prismic.io/core/documents/${pageId}`
      )

      const json = await request.json()
      const type = json.custom_type_id

      this.customTypes[pageId] = type

      return type
    }

    async getCustomTypeFields(customType) {
      const repoName = this.getRepoName()
      const apiKey = await this.getApiKey()

      const request = await fetch(
        `https://customtypes.prismic.io/customtypes/${customType}?static=true`,
        {
          headers: {
            Repository: repoName,
            Authorization: `Bearer ${apiKey}`,
          },
        }
      )

      if (!request.ok) {
        throw new Error('API key probably invalid')
      }

      const json = await request.json()

      return json
    }

    async getDocumentsFromType(fieldTypes) {
      if (this.documents[fieldTypes]) {
        return this.documents[fieldTypes]
      }

      const repoName = this.getRepoName()

      const request = await fetch(
        `https://${repoName}.prismic.io/core/documents/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            statuses: ['unclassified', 'published'],
            language: 'en-us',
            customTypes: fieldTypes.split(','),
            limit: 999, // I dunno how far this limit can go, so just freestyle it at 99 for now
            // If there's more than 999 of a certain type it's kinda fucked anyway idk
          }),
        }
      )

      const json = await request.json()

      // Set it in cache so we don't have to fetch again
      this.documents[fieldTypes] = json.results

      return json.results
    }
  }

  const prismicApiHelper = new PrismicApiHelper()

  /*
   * Above is just some helpers for the Prismic API, the meat and potatoes of this bitch is below
   */

  const labelField = (field, apiFields) => {
    // Figure out the field label
    const label = field.querySelector('label')
    const fieldLabel = label.textContent.trim()

    // Now let's try to find that label in the apiFields
    const apiField = Object.values(apiFields).find(f => {
      return f?.config?.label === fieldLabel
    })

    // We're only targetting Link fields here, so can ignore everything else
    if (apiField.type !== 'Link') {
      return
    }

    // Add some attributes for now
    field.setAttribute('data-field-type', 'link')
    field.setAttribute('data-accepted', apiField.config.customtypes.join(','))
  }

  const getSliceVariationFields = (sliceName, sliceVariation, fields) => {
    const slices = fields.slices.config.choices

    const slice = Object.values(slices).find(slice => {
      return slice.name === sliceName
    })

    if (slice.variations.length === 1) {
      return slice
    }

    const variation = slice.variations.find(variation => {
      return variation.name === sliceVariation
    })

    return variation?.primary
  }

  const createButton = (type, url, text, className, checkId = null) => {
    const newButton = document.createElement(type)
    if (url) {
      newButton.href = url
    }
    newButton.innerHTML = text
    newButton.setAttribute('target', '_blank')
    newButton.setAttribute('class', className + ' silly-extension-button')
    if (checkId) {
      newButton.setAttribute('for', checkId)
    }

    return newButton
  }

  const getRandomId = () => {
    let id = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const charactersLength = characters.length

    for (let i = 0; i < 10; i++) {
      id += characters.charAt(Math.floor(Math.random() * charactersLength))
    }

    return id
  }

  const addButtonsToFields = async () => {
    const fields = document.querySelectorAll('[data-field-type="link"]')

    for (let field of fields) {
      if (field.querySelector('.silly-extension-button')) {
        // There's already a button here, no need to make another

        continue
      }

      const fieldInput = field.querySelector('input')
      const fieldButton = field.querySelector('button')
      const newClass =
        fieldButton.getAttribute('class') + ' silly-extension-button'
      const acceptedTypes = field.getAttribute('data-accepted')

      if (fieldInput.getAttribute('value') !== '') {
        // There's a value in the field, so we need to find the document it's linking to
        // Because everything I could find in Prismic is either protected by CORS or doesn't
        // have an official endpoint, we have to use a hacky undocumented API to get all the
        // documents of a certain set of types and then filter through them to find the one.

        // If Prismic doesn't like it maybe they should stop complaining and make with the data 😡
        const documents = await prismicApiHelper.getDocumentsFromType(
          acceptedTypes
        )

        const foundDocument = documents.find(doc => {
          return doc.title === fieldInput.getAttribute('value')
        })

        if (!foundDocument) {
          // No document, don't do anything here I guess lol
          console.warn(`
            i couldn't find a document with the title ${fieldInput.getAttribute(
              'value'
            )} sorry 😭

sorry again,
the browser extension
          `)

          continue
        }

        const repoName = prismicApiHelper.getRepoName()
        const url = `https://${repoName}.prismic.io/builder/pages/${foundDocument.id}`

        // Now let's just create the new button to shove next to the existing one
        const newButton = createButton('a', url, '&nearr;', newClass)

        fieldButton.parentElement.prepend(newButton)

        continue
      }

      const repoName = prismicApiHelper.getRepoName()

      // Ok, so there's no document set here. We have two paths in that case. Either the field
      // can only accept one type, or it can accept multiple. If it can only accept one, we can
      // just add a link to that type, so let's just do that
      if (acceptedTypes.includes(',')) {
        // There's multiple, so let's make a funny little dropdown
        const wrapper = document.createElement('div')
        wrapper.setAttribute('class', 'silly-extension-dropdown-wrapper')

        // For the toggle we're conna use an input
        const input = document.createElement('input')
        const inputId = getRandomId()
        input.setAttribute('type', 'checkbox')
        input.setAttribute('id', inputId)
        input.setAttribute('class', 'silly-extension-toggle')

        // Make the button as a label
        const newButton = createButton('label', null, '+', newClass, inputId)

        // Then just create the dropdown
        const dropdown = document.createElement('div')
        dropdown.setAttribute('class', 'silly-extension-dropdown')

        const types = acceptedTypes.split(',')

        for (let type of types) {
          const url = `https://${repoName}.prismic.io/builder/pages/new?custom_type=${type}&locale=en-us`
          const button = document.createElement('a')
          button.href = url
          button.textContent = type
          button.setAttribute('target', '_blank')

          dropdown.appendChild(button)
        }

        // Add all that shit to the wrapper
        wrapper.appendChild(newButton)
        wrapper.appendChild(input)
        wrapper.appendChild(dropdown)

        // Make it so you can see the dropdown
        field.querySelector('label + div').style.overflow = 'visible'

        // Now add the wrapper to the field, next to the button
        fieldButton.parentElement.prepend(wrapper)

        continue
      }

      // There's only one, just add a button
      const url = `https://${repoName}.prismic.io/builder/pages/new?custom_type=${acceptedTypes}&locale=en-us`

      // Now let's just create the new button to shove next to the existing one
      const newButton = createButton('a', url, '+', newClass)

      fieldButton.parentElement.prepend(newButton)
    }
  }

  const createExtensionStyles = () => {
    const extensionStyles = document.createElement('style')
    extensionStyles.classList.add('silly-extension-styles')

    extensionStyles.innerHTML = `
      .silly-extension-button {
        cursor: pointer;
        color: var(--grey11) !important;
      }
      
      .silly-extension-button:hover {
        background-color: var(--grey3);
      }

      .silly-extension-dropdown-wrapper {
        position: relative;
      }

      .silly-extension-toggle {
        position: absolute;
        left: -999px;
      }

      .silly-extension-toggle:checked + .silly-extension-dropdown {
        display: flex;
      }

      .silly-extension-dropdown {
        position: absolute;
        bottom: -4px;
        right: 0;
        display: none;
        background: var(--grey1);
        border: 1px solid var(--grey7);
        border-radius: 6px;
        flex-direction: column;
        overflow: hidden;
        text-align: center;
        transform: translateY(100%);
        z-index: 999;
      }

      .silly-extension-dropdown a {
        padding: 4px 8px;
        color: var(--indigo11);
        font-family: var(--font-family-body);
        font-size: .75rem;
        text-decoration: none;
      }

      .silly-extension-dropdown a:hover {
        background-color: var(--grey3);
      }
    `

    document.body.appendChild(extensionStyles)
  }

  const onPageLoad = async customFields => {
    // Right so we've got the fields now, let's get the stuff that we're interested in
    const apiFields = customFields.json.Main

    // Now let's get the fields that are actually on the page
    // We're just getting the main fields here, I'm gonna deal with the slices later
    const mainFields = document.querySelectorAll(
      'fieldset:first-child > div > div'
    )

    // So now let's loop through the fields and figure out what's what
    for (let field of mainFields) {
      labelField(field, apiFields)
    }

    const sliceFields = document.querySelectorAll('fieldset:not(:first-child)')

    for (let slice of sliceFields) {
      // To label the slices we need to gather a bit more information about the slice and
      // the fields, so do that here
      const headerText = slice.querySelector('header').textContent.trim()
      const splitHeaderText = headerText.match(/[A-Za-z ]+/g)

      const sliceName = splitHeaderText[0].trim()
      const sliceVariation = splitHeaderText[1].trim()

      // Find the right object in the fields we got back from the API
      const sliceFields = getSliceVariationFields(
        sliceName,
        sliceVariation,
        apiFields
      )

      if (!sliceFields) {
        // I dunno if this can ever happen, but better put it here just in case I suppose
        continue
      }

      // Right, now we can just get the fields and label them like we did for the others
      const fields = slice.querySelectorAll(':scope > div > div > div')

      for (let field of fields) {
        labelField(field, sliceFields)
      }
    }

    // Right, now we can add the buttons to the fields
    addButtonsToFields()

    // Don't add the styles if those jawns already exist
    if (document.querySelector('.silly-extension-styles')) {
      return
    }

    // Finally let's add a few helper styles for our buttons
    createExtensionStyles()
  }

  const onPageChange = async () => {
    if (!window.location.pathname.startsWith('/builder/pages/')) {
      // We're not on an actual document here, so there's nothing to do
      return
    }

    const apiKey = await prismicApiHelper.getApiKey()
    if (typeof apiKey === 'undefined') {
      // If this is undefined then we've never seen this repo before, so let's add
      // it to the Chrome storage so we can store it
      await prismicApiHelper.setRepoInChromeStorage()
    }

    if (!apiKey) {
      // If we still don't have an API key, then we're not gonna go any further
      // Maybe complain a bit in the console though
      // TODO: Make this message less stupid maybe idk
      console.error(
        `you didn't set an api key for this repo, so now i can't do anything 😭 sort it out please
you can get an api key from https://${repoName}.prismic.io/settings/apps/ in the 'Write APIs' tab

love from,
the browser extension 🥰`
      )

      return
    }

    // So we're on a document page, let's get the page's type
    const pageId = prismicApiHelper.getPageId()
    let pageType = ''

    if (pageId === 'new') {
      // We're making a new page, so we've gotta get the page type from the URL instead
      const queryParams = new URLSearchParams(window.location.search)

      pageType = queryParams.get('custom_type')
    } else {
      pageType = await prismicApiHelper.getPageCustomType()
    }

    // Then get the fields of that type so we know what we're working with
    let customFields = null
    try {
      customFields = await prismicApiHelper.getCustomTypeFields(pageType)
    } catch (e) {
      const repoName = prismicApiHelper.getRepoName()

      // If something's gone wrong with this request then it's most likely because the API key isn't right
      // So let's tell the user to get another one
      console.error(
        `the api key you gave me didn't work 😡
get a new one from https://${repoName}.prismic.io/settings/apps/ in the 'Write APIs' tab

sincerely
the browser extension 😘`
      )

      return
    }

    // Sometimes by the time the above is done the fields will be loaded in, so we can just continue
    if (document.querySelector('fieldset:first-child')) {
      onPageLoad(customFields)

      return
    }

    // Otherwise we've got to try and figure out when the fields have loaded in. The best (probably not) way
    // to do this is to create a MutationObserver that will liten for DOM changes, then call the function
    // when the field we want is available
    const config = { attributes: true, childList: true, subtree: true }

    const callback = () => {
      if (!document.querySelector('fieldset:first-child')) {
        return
      }

      // If we've got here then it's FINALLY available, so we can move on
      onPageLoad(customFields)
      observer.disconnect()
    }

    const observer = new MutationObserver(callback)
    observer.observe(document.body, config)
  }

  // We need to detect when the page changes
  // Since the Prismic front end is an SPA, we can't rely on the extension loading
  // on every page load. So we'll do this hacky shit where we listen for the
  // location to change every 200ms. Yuck.
  let page = window.location.href
  const interval = setInterval(() => {
    if (window.location.href === page) {
      return
    }

    onPageChange()
    page = window.location.href
  }, 200)

  // Then we run it again, just in case we land on a document page to begin with
  onPageChange()
})()
