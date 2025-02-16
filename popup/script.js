;(async () => {
  const formWrapper = document.querySelector('.js-form-wrapper')
  const fieldTemplate = document.querySelector('.js-field-template')

  const getRandomId = () => {
    let id = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const charactersLength = characters.length

    for (let i = 0; i < 10; i++) {
      id += characters.charAt(Math.floor(Math.random() * charactersLength))
    }

    return id
  }

  const setApiKey = async e => {
    const target = e.target
    const repoName = target.getAttribute('name')
    const apiKey = target.value

    const { apiKeys } = await chrome.storage.local.get('apiKeys')

    await chrome.storage.local.set({
      apiKeys: {
        ...apiKeys,
        [repoName]: apiKey,
      },
    })
  }

  const createFields = async () => {
    const { apiKeys } = await chrome.storage.local.get('apiKeys')
    const apiKeysEntries = Object.entries(apiKeys)

    if (apiKeysEntries.length > 0) {
      formWrapper.innerHTML = ''
    }

    for (let [key, value] of apiKeysEntries) {
      const field = fieldTemplate.content.cloneNode(true)
      const fieldId = getRandomId()

      const label = field.querySelector('.js-label')
      const repoName = field.querySelector('.js-repo-name')
      const input = field.querySelector('.js-input')

      label.setAttribute('for', fieldId)
      repoName.textContent = key
      input.setAttribute('id', fieldId)
      input.setAttribute('name', key)

      input.addEventListener('change', setApiKey)

      if (value) {
        input.value = value
      }

      formWrapper.appendChild(field)
    }
  }

  createFields()
})()
