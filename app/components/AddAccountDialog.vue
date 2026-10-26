<script setup lang="ts">
// Log in an existing game account, or create a new one with a generated password.
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
const tab = ref<'login' | 'create'>('login')
const login = reactive({ account: '', password: '', shouldRememberPassword: true })
const create = reactive({ account: '', name: '' })
const created = ref<{ name: string, password: string } | null>(null)
const status = ref('')
const isBusy = ref(false)

function open() {
  Object.assign(login, { account: '', password: '', shouldRememberPassword: true })
  Object.assign(create, { account: '', name: '' })
  created.value = null
  status.value = ''
  tab.value = 'login'
  dialog.value?.showModal()
}
defineExpose({ open })

async function submit(path: string, body: object, onDone: (result: Record<string, string>) => void) {
  isBusy.value = true
  status.value = '…'
  try {
    onDone(await callApi<Record<string, string>>('POST', path, body))
  } catch (error) {
    status.value = (error as Error).message
  } finally {
    isBusy.value = false
  }
}

const submitLogin = () => submit('/api/accounts/login', login, (result) => {
  dialog.value?.close()
  showToast(`${result.account} added`)
})
const submitCreate = () => submit('/api/accounts/create', create, (result) => {
  status.value = ''
  created.value = { name: result.name!, password: result.password! }
  showToast(`${result.name} created — copy the password now`)
})

async function copyPassword() {
  try { await navigator.clipboard.writeText(created.value!.password); showToast('Password copied') } catch { showToast('Copy failed — select it by hand', 'error') }
}
</script>

<template>
  <dialog ref="dialog" class="dialog">
    <div class="dialog-tabs" role="tablist">
      <button role="tab" :aria-selected="tab === 'login'" @click="tab = 'login'; status = ''">{{ t('loginTab') }}</button>
      <button role="tab" :aria-selected="tab === 'create'" @click="tab = 'create'; status = ''">{{ t('createTab') }}</button>
    </div>

    <form v-if="tab === 'login'" class="stack" @submit.prevent="submitLogin">
      <label>{{ t('accountId') }} <input v-model.trim="login.account" required autocomplete="username"></label>
      <label>{{ t('password') }} <input v-model="login.password" type="password" required autocomplete="current-password"></label>
      <label class="checkbox"><input v-model="login.shouldRememberPassword" type="checkbox"> {{ t('rememberPassword') }}</label>
      <p class="form-error">{{ status }}</p>
      <div class="dialog-actions">
        <button type="button" class="button" @click="dialog?.close()">{{ t('cancel') }}</button>
        <button class="button primary" :disabled="isBusy">{{ t('logIn') }}</button>
      </div>
    </form>

    <form v-else class="stack" @submit.prevent="submitCreate">
      <label>{{ t('accountId') }} <input v-model.trim="create.account" required maxlength="32" autocomplete="off"></label>
      <label>{{ t('characterName') }} <input v-model.trim="create.name" required maxlength="16" autocomplete="off"></label>
      <p class="hint">{{ t('createHint') }}</p>
      <div v-if="created" class="password-reveal">
        <span>{{ t('passwordFor') }} <b>{{ created.name }}</b>:</span>
        <code>{{ created.password }}</code>
        <button type="button" class="button" @click="copyPassword">{{ t('copy') }}</button>
      </div>
      <p class="form-error">{{ status }}</p>
      <div class="dialog-actions">
        <button type="button" class="button" @click="dialog?.close()">{{ t('close') }}</button>
        <button class="button primary" :disabled="isBusy || !!created">{{ t('createAccount') }}</button>
      </div>
    </form>
  </dialog>
</template>
