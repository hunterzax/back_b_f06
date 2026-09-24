export const Sel = {
  login: {
    btnLocal: '[data-testid="btn-login-local"]',
    btnPTT: '[data-testid="btn-login-ptt"]',
    btnExternal: '[data-testid="btn-login-external"]',
    username: '[data-testid="input-username"]',
    password: '[data-testid="input-password"]',
    captchaInput: '[data-testid="input-captcha"]',
    captchaImage: '[data-testid="img-captcha"]',
    captchaRefresh: '[data-testid="btn-captcha-refresh"]',
    btnSubmit: '[data-testid="btn-submit-login"]',
    err: '[data-testid="login-error"]',
    tAndC: '[data-testid="modal-tnc"]',
    tAndCAccept: '[data-testid="btn-tnc-accept"]',
  },
  main: {
    announcement: '[data-testid="announcement"]',
    profileMenu: '[data-testid="menu-profile"]',
    myProfile: '[data-testid="menu-my-profile"]',
    logout: '[data-testid="menu-logout"]',
    confirmLogout: '[data-testid="btn-confirm-logout"]',
    menuDashboard: '[data-testid="menu-dashboard"]',
  },
  profile: {
    firstName: '[data-testid="profile-firstname"]',
    lastName: '[data-testid="profile-lastname"]',
    role: '[data-testid="profile-role"]',
    email: '[data-testid="profile-email"]',
    company: '[data-testid="profile-company"]',
    eSigUpload: 'input[type="file"][data-testid="upload-signature"]',
    saveESig: '[data-testid="btn-save-signature"]',
    toastSuccess: '[data-testid="toast-success"]',
  }
};