<script setup lang="ts">
// Log in an existing game account, or create a new one with a generated password.
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
const tab = ref<'login' | 'create'>('login')
const login = reactive({ account: '', password: '', shouldRememberPassword: true })
const create = reactive({ name: '' })
const created = ref<{ account: string, name: string, password: string } | null>(null)
const status = ref('')
const isBusy = ref(false)
// Accounts removed earlier: one click adds them back (if a password was saved) or fills the form.
const previousAccounts = ref<Array<{ account: string, name: string, hasPassword: boolean }>>([])
const passwordInput = ref<HTMLInputElement>()
const loadPrevious = async () => { previousAccounts.value = await callApi('GET', '/api/accounts/previous').catch(() => []) as typeof previousAccounts.value }

function open() {
  Object.assign(login, { account: '', password: '', shouldRememberPassword: true })
  create.name = ''
  created.value = null
  status.value = ''
  tab.value = 'login'
  loadPrevious()
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
  created.value = { account: result.account!, name: result.name!, password: result.password! }
  showToast(`${result.name} created — copy the password now`)
})

function pickPrevious(previous: { account: string, hasPassword: boolean }) {
  if (previous.hasPassword) {
    return submit('/api/accounts/previous', { account: previous.account }, (result) => {
      dialog.value?.close()
      showToast(t('addedAccount', { name: result.account! }))
    })
  }
  login.account = previous.account
  login.password = ''
  nextTick(() => passwordInput.value?.focus())
}
async function forgetPrevious(account: string) {
  if (await runAndReport(() => callApi('DELETE', '/api/accounts/previous', { account }))) loadPrevious()
}

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
      <div v-if="previousAccounts.length">
        <div class="section-title">{{ t('previousAccounts') }}</div>
        <ul class="previous-accounts">
          <li v-for="previous in previousAccounts" :key="previous.account">
            <button type="button" class="link-name" :disabled="isBusy" @click="pickPrevious(previous)">{{ previous.name }}</button>
            <span class="muted">{{ previous.account }} · {{ previous.hasPassword ? t('oneClickLogin') : t('needsPassword') }}</span>
            <button type="button" class="icon-button" :title="t('forget')" :aria-label="`${t('forget')} ${previous.account}`" @click="forgetPrevious(previous.account)">✕</button>
          </li>
        </ul>
      </div>
      <label>{{ t('accountId') }} <input v-model.trim="login.account" required autocomplete="username"></label>
      <label>{{ t('password') }} <input ref="passwordInput" v-model="login.password" type="password" required autocomplete="current-password"></label>
      <label class="checkbox"><input v-model="login.shouldRememberPassword" type="checkbox"> {{ t('rememberPassword') }}</label>
      <p class="form-error">{{ status }}</p>
      <div class="dialog-actions">
        <button type="button" class="button" @click="dialog?.close()">{{ t('cancel') }}</button>
        <button class="button primary" :disabled="isBusy">{{ t('logIn') }}</button>
      </div>
    </form>

    <form v-else class="stack" @submit.prevent="submitCreate">
      <label>{{ t('characterName') }} <input v-model.trim="create.name" required maxlength="16" autocomplete="off"></label>
      <p class="hint">{{ t('createHint') }}</p>
      <div v-if="created" class="password-reveal">
        <span>{{ t('username') }}: <code>{{ created.account }}</code></span>
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
