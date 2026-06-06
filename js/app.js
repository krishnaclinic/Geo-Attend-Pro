const CONFIG = {
  OWNER_EMAIL: 'krishnahospitalsapotra@gmail.com',
  GEOFENCE_RADIUS: 50,
  GPS_ACCURACY_THRESHOLD: 100,
  PAGE_SIZE: 50,
  REMINDER_CHECK_INTERVAL: 60000,
  SHIFT_AUTO_CLOSE_HOURS: 0.0024,
  REMINDER_HOURS_OPEN: 10,
  DAILY_REMINDER_IN: '07:00',
  DAILY_REMINDER_OUT: '19:00',
  firebaseConfig: {
    apiKey: "AIzaSyBumdDi-oOOAoQauLnQDVHJcvbXvJ4nmu0",
    authDomain: "geo-attend-pro.firebaseapp.com",
    projectId: "geo-attend-pro",
    storageBucket: "geo-attend-pro.firebasestorage.app",
    messagingSenderId: "935757975182",
    appId: "1:935757975182:web:a4f77773d67a02034003df"
  }
};

const STATE = {
  firebaseUser: null,
  view: 'employee',
  isOwner: false,
  isRegistered: false,
  stores: [],
  employees: [],
  attendance: [],
  todayAttendance: [],
  employeeRecord: null,
  assignedStore: null,
  geoPosition: null,
  geoDistance: null,
  isWithinGeofence: false,
  selfieDataUrl: null,
  currentStatus: null,
  cameraStream: null,
  editingStoreId: null,
  editingEmpEmail: null,
  editingAttendanceId: null,
  filterActive: false,
  openShift: null,
  attendancePage: 0,
  attendanceTotal: 0,
  allAttendanceRaw: [],
  reminderInterval: null,
  pendingPunchAction: null,
  unsubStores: null,
  unsubEmployees: null,
  unsubAttendance: null,
  calMonth: null,
  calYear: null
};

const Firebase = {
  app: null, auth: null, db: null,
  init() {
    Firebase.app = firebase.initializeApp(CONFIG.firebaseConfig);
    Firebase.auth = firebase.auth();
    Firebase.db = firebase.firestore();
    Firebase.db.enablePersistence({ synchronizeTabs: true }).catch(e => console.warn('Offline persistence unavailable:', e.code || e));
    Firebase.auth.onAuthStateChanged(user => {
      if (user) { STATE.firebaseUser = user; App.handleAuthSuccess(user); }
      else { App.handleLogout(); }
    });
  }
};

const Utils = {
  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
  escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
  sanitizePhotoUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.match(/^data:image\/(jpeg|png|gif|webp);base64,/) ? url : '';
  },
  showToast(message, type = 'success', duration = 3500) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = message;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, duration);
  },
  showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); },
  hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); },
  haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },
  getToday() { return new Date().toISOString().split('T')[0]; },
  formatTime(ts) {
    const d = ts?.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  },
  formatDate(ts) {
    const d = ts?.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },
  formatTimestamp(ts) {
    if (!ts) return '—';
    return `${Utils.formatDate(ts)} ${Utils.formatTime(ts)}`;
  },
  getDeviceInfo() { return navigator.userAgent.substring(0, 120); },
  getStoreName(storeId) {
    const s = STATE.stores.find(x => x.id === storeId);
    return s ? s.name : '—';
  },
  msToHours(ms) {
    if (ms <= 0) return '0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },
  validatePassword(password) {
    const checks = {
      min: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/;`~]/.test(password)
    };
    return { checks, allMet: Object.values(checks).every(Boolean) };
  },
  togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const btn = input.parentElement.querySelector('.password-toggle');
    if (btn) btn.textContent = isPassword ? '🙈' : '👁';
  },
  async getPasswordHash(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  getStoredAdminPassword() { try { return localStorage.getItem('geoAttendPro_adminPwd'); } catch { return null; } },
  async setStoredAdminPassword(password) { try { localStorage.setItem('geoAttendPro_adminPwd', await Utils.getPasswordHash(password)); } catch {} },
  async verifyAdminPassword(password) {
    const stored = Utils.getStoredAdminPassword();
    return stored ? stored === await Utils.getPasswordHash(password) : false;
  },
  computeAttendanceStatus(records, email) {
    const userRecords = records.filter(r => r.email === email);
    userRecords.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    if (userRecords.length === 0) return 'absent';
    const hasIn = userRecords.some(r => r.action === 'IN');
    const hasOut = userRecords.some(r => r.action === 'OUT');
    if (hasIn && hasOut) return 'present';
    if (hasIn && !hasOut) {
      const lastIn = userRecords.filter(r => r.action === 'IN').pop();
      const lastInTime = lastIn.timestamp?.toMillis?.() || new Date(lastIn.timestamp).getTime();
      if (Date.now() - lastInTime > 86400000) return 'absent';
      return 'working';
    }
    return 'absent';
  },
  getMonthDays(year, month) {
    const days = [];
    const totalDays = new Date(year, parseInt(month), 0).getDate();
    for (let d = 1; d <= totalDays; d++) {
      days.push(`${year}-${month}-${String(d).padStart(2, '0')}`);
    }
    return days;
  },
  formatDateStr(dateStr) {
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
  findOpenShift() {
    const all = STATE.allAttendanceRaw.length > 0 ? STATE.allAttendanceRaw : STATE.todayAttendance;
    const userRecords = all.filter(r => r.email === STATE.firebaseUser?.email);
    userRecords.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    let inTime = null;
    let inRecord = null;
    for (const r of userRecords) {
      if (r.action === 'IN') { inTime = r.timestamp?.toMillis?.() || new Date(r.timestamp).getTime(); inRecord = r; }
      else if (r.action === 'OUT') { inTime = null; inRecord = null; }
    }
    if (inTime && inRecord) {
      return { record: inRecord, timestamp: inTime, date: inRecord.date };
    }
    return null;
  }
};

const Auth = {
  async login() {
    if (!Firebase.auth) { Utils.showToast('Firebase not initialized.', 'error'); return; }
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { Utils.showToast('Enter email and password', 'warning'); return; }
    Utils.showLoading();
    try {
      await Firebase.auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      const msg = e.code === 'auth/user-not-found' ? 'Account not found. Register first.' :
                  e.code === 'auth/wrong-password' ? 'Wrong password' :
                  e.code === 'auth/invalid-credential' ? 'Invalid email or password' :
                  e.code === 'auth/network-request-failed' ? 'Network error.' :
                  e.message;
      Utils.showToast('Login failed: ' + msg, 'error');
    } finally { Utils.hideLoading(); }
  },
  async register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (!name || !email || !password) { Utils.showToast('Fill all fields', 'warning'); return; }
    const { allMet } = Utils.validatePassword(password);
    if (!allMet) { Utils.showToast('Password does not meet requirements', 'warning'); return; }
    if (password !== confirm) { Utils.showToast('Passwords do not match', 'warning'); return; }
    if (!Firebase.auth) { Utils.showToast('Firebase not initialized.', 'error'); return; }
    Utils.showLoading();
    try {
      const cred = await Firebase.auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      Utils.showToast('Account created! Welcome.', 'success');
    } catch (e) {
      const msg = e.code === 'auth/email-already-in-use' ? 'Email already registered. Sign in.' :
                  e.code === 'auth/network-request-failed' ? 'Network error.' : e.message;
      Utils.showToast(msg, 'error');
    } finally { Utils.hideLoading(); }
  },
  async forgotPassword() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) { Utils.showToast('Enter your email first', 'warning'); return; }
    if (!Firebase.auth) { Utils.showToast('Firebase not initialized.', 'error'); return; }
    Utils.showLoading();
    try {
      await Firebase.auth.sendPasswordResetEmail(email);
      Utils.showToast('Password reset email sent! Check your inbox.', 'success');
    } catch (e) {
      const msg = e.code === 'auth/user-not-found' ? 'No account with this email.' :
                  e.code === 'auth/network-request-failed' ? 'Network error.' : e.message;
      Utils.showToast('Failed: ' + msg, 'error');
    } finally { Utils.hideLoading(); }
  },
  async logout() {
    Staff.closeCamera();
    App.stopReminders();
    await Firebase.auth.signOut();
  },
  showRegister() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  },
  showLogin() {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  }
};

const DB = {
  startListeners() {
    DB.stopListeners();
    STATE.unsubStores = Firebase.db.collection('stores')
      .onSnapshot(snapshot => {
        STATE.stores = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (STATE.view === 'admin') { UI.renderStores(); Admin.updateStats(); }
        if (STATE.view === 'employee') Staff.updateAssignedStore();
        UI.updateHeaderStoreName();
      }, () => {});
    STATE.unsubEmployees = Firebase.db.collection('employees')
      .onSnapshot(snapshot => {
        STATE.employees = snapshot.docs.map(d => ({ email: d.id, ...d.data() }));
        if (STATE.firebaseUser) {
          STATE.employeeRecord = STATE.employees.find(e => e.email?.toLowerCase() === STATE.firebaseUser.email.toLowerCase());
          STATE.isRegistered = !!STATE.employeeRecord;
        }
        if (STATE.view === 'admin') { UI.renderEmployees(); Admin.updateStats(); UI.populateStoreDropdown(); UI.populateStaffDropdowns(); }
        if (STATE.view === 'employee') UI.renderEmployeeView();
        UI.updateHeaderStoreName();
      }, () => {});
    if (STATE.firebaseUser) {
      const today = Utils.getToday();
      const processSnapshot = (snapshot) => {
        STATE.todayAttendance = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        STATE.todayAttendance.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
        STATE.openShift = Staff.detectOpenShift();
        if (STATE.view === 'employee') { Staff.updateStatus(); UI.renderEmployeeView(); }
        if (STATE.view === 'admin') Admin.updateStats();
      };
      // Try with orderBy first (requires composite index)
      STATE.unsubAttendance = Firebase.db.collection('attendance')
        .where('email', '==', STATE.firebaseUser.email)
        .where('date', '==', today)
        .orderBy('timestamp', 'asc')
        .onSnapshot(processSnapshot, err => {
          if (err.code === 'failed-precondition') {
            // Fallback: no orderBy, sort client-side
            if (STATE.unsubAttendance) { STATE.unsubAttendance(); STATE.unsubAttendance = null; }
            STATE.unsubAttendance = Firebase.db.collection('attendance')
              .where('email', '==', STATE.firebaseUser.email)
              .where('date', '==', today)
              .onSnapshot(processSnapshot, fallbackErr => {
                console.warn('Attendance fallback query also failed:', fallbackErr);
                Utils.showToast('⚠️ Attendance query failed. Check Firestore index.', 'error', 8000);
              });
          } else {
            console.warn('Attendance query error:', err);
          }
        });
      // M10: Load yesterday's records for cross-midnight shift detection
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      Firebase.db.collection('attendance')
        .where('email', '==', STATE.firebaseUser.email)
        .where('date', '==', yesterdayStr)
        .get().then(snap => {
          STATE.yesterdayAttendance = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          STATE.openShift = Staff.detectOpenShift();
          if (STATE.view === 'employee') UI.renderEmployeeView();
        }).catch(() => {});
    }
  },
  stopListeners() {
    if (STATE.unsubStores) { STATE.unsubStores(); STATE.unsubStores = null; }
    if (STATE.unsubEmployees) { STATE.unsubEmployees(); STATE.unsubEmployees = null; }
    if (STATE.unsubAttendance) { STATE.unsubAttendance(); STATE.unsubAttendance = null; }
  },
  async addStore(name, lat, lng) {
    if (!name || isNaN(lat) || isNaN(lng)) { Utils.showToast('Invalid store data', 'error'); return; }
    Utils.showLoading();
    try { await Firebase.db.collection('stores').add({ name: name.trim(), lat: parseFloat(lat), lng: parseFloat(lng) }); Utils.showToast(`Store "${name}" added ✓`); }
    catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async updateStore(id, data) {
    Utils.showLoading();
    try { await Firebase.db.collection('stores').doc(id).update(data); Utils.showToast('Store updated ✓'); }
    catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async deleteStore(id) {
    if (!confirm('Delete this store?')) return;
    Utils.showLoading();
    try { await Firebase.db.collection('stores').doc(id).delete(); Utils.showToast('Store deleted ✓'); }
    catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async addEmployee(name, email, storeId) {
    if (!name || !email || !storeId) { Utils.showToast('Fill all employee fields', 'error'); return; }
    Utils.showLoading();
    try {
      await Firebase.db.collection('employees').doc(email.trim().toLowerCase()).set({
        name: name.trim(), email: email.trim().toLowerCase(), storeId, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      Utils.showToast(`Employee "${name}" added ✓`);
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async deleteEmployee(email) {
    if (!confirm('Delete this employee?')) return;
    Utils.showLoading();
    try { await Firebase.db.collection('employees').doc(email).delete(); Utils.showToast('Employee deleted ✓'); }
    catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async updateEmployee(oldEmail, data) {
    Utils.showLoading();
    try {
      const snap = await Firebase.db.collection('employees').doc(oldEmail).get();
      if (!snap.exists) { Utils.showToast('Employee not found', 'error'); return; }
      // M11: Block email changes — too risky to cascade to attendance records
      const newEmail = data.email?.trim().toLowerCase();
      if (newEmail && newEmail !== oldEmail) {
        Utils.showToast('Cannot change email — create a new employee instead', 'warning');
        return;
      }
      // Remove email from data to avoid accidental overwrite
      const { email, ...updateData } = data;
      await Firebase.db.collection('employees').doc(oldEmail).update(updateData);
      Utils.showToast('Employee updated ✓');
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async loadAllAttendance() {
    try {
      const snap = await Firebase.db.collection('attendance').orderBy('timestamp', 'desc').limit(5000).get();
      STATE.allAttendanceRaw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      STATE.attendanceTotal = STATE.allAttendanceRaw.length;
      STATE.attendancePage = 0;
      STATE.filterActive = false;
      DB.applyPage();
    } catch { STATE.allAttendanceRaw = []; STATE.attendance = []; }
  },
  applyPage() {
    const start = STATE.attendancePage * CONFIG.PAGE_SIZE;
    const end = start + CONFIG.PAGE_SIZE;
    STATE.attendance = STATE.allAttendanceRaw.slice(start, end);
    if (STATE.view === 'admin') UI.renderAdminAttendance();
    UI.updatePagination();
  },
  nextPage() {
    if ((STATE.attendancePage + 1) * CONFIG.PAGE_SIZE < STATE.attendanceTotal) {
      STATE.attendancePage++;
      DB.applyPage();
    }
  },
  prevPage() {
    if (STATE.attendancePage > 0) {
      STATE.attendancePage--;
      DB.applyPage();
    }
  },
  async deleteAttendance(id) {
    if (!confirm('Delete this attendance record?')) return;
    Utils.showLoading();
    try { await Firebase.db.collection('attendance').doc(id).delete(); Utils.showToast('Record deleted ✓'); DB.loadAllAttendance(); }
    catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async updateAttendance(id, newAction, newTimestamp) {
    Utils.showLoading();
    try {
      const updateData = { action: newAction };
      if (newTimestamp) {
        const d = new Date(newTimestamp);
        if (!isNaN(d.getTime())) {
          updateData.timestamp = firebase.firestore.Timestamp.fromDate(d);
          updateData.date = d.toISOString().split('T')[0];
        }
      }
      await Firebase.db.collection('attendance').doc(id).update(updateData);
      Utils.showToast('Record updated ✓');
      document.getElementById('edit-modal-overlay').classList.add('hidden');
      STATE.editingAttendanceId = null;
      DB.loadAllAttendance();
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async loadMonthlyReport(year, month, staffEmail) {
    const paddedMonth = String(month).padStart(2, '0');
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(year, parseInt(month), 0).getDate();
    const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`;
    Utils.showLoading();
    try {
      const snap = await Firebase.db.collection('attendance').where('date', '>=', startDate).where('date', '<=', endDate).get();
      let records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (staffEmail) records = records.filter(r => r.email === staffEmail);
      records.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      if (STATE.view === 'admin') UI.showReportPopup(records, staffEmail, year, month);
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },
  async loadCalendarData(year, month, staffEmail) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    try {
      const snap = await Firebase.db.collection('attendance').where('date', '>=', startDate).where('date', '<=', endDate).get();
      let records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (staffEmail) records = records.filter(r => r.email === staffEmail);
      return records;
    } catch (e) { console.warn('Calendar load failed:', e); Utils.showToast('Failed to load calendar data', 'error'); return []; }
  }
};

const Staff = {
  updateAssignedStore() {
    STATE.assignedStore = STATE.employeeRecord ? STATE.stores.find(s => s.id === STATE.employeeRecord.storeId) : null;
  },
  detectOpenShift() {
    const all = STATE.allAttendanceRaw.length > 0 ? STATE.allAttendanceRaw : STATE.todayAttendance;
    const userRecords = all.filter(r => r.email === STATE.firebaseUser?.email);
    userRecords.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
    let inRecord = null;
    for (const r of userRecords) {
      if (r.action === 'IN') inRecord = r;
      else if (r.action === 'OUT') inRecord = null;
    }
    // M10: Also check yesterday's records for cross-midnight shifts (employee view)
    if (!inRecord && STATE.allAttendanceRaw.length === 0 && STATE.todayAttendance.length === 0) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const yesterdayRecords = STATE.yesterdayAttendance?.filter(r => r.email === STATE.firebaseUser?.email) || [];
      for (const r of yesterdayRecords) {
        if (r.action === 'IN') inRecord = r;
        else if (r.action === 'OUT') inRecord = null;
      }
    }
    return inRecord;
  },
  updateStatus() {
    const open = STATE.openShift || Staff.detectOpenShift();
    if (open) {
      STATE.currentStatus = 'clocked_in';
      return;
    }
    if (STATE.todayAttendance.length === 0) { STATE.currentStatus = 'none'; return; }
    const hasIn = STATE.todayAttendance.some(r => r.action === 'IN');
    const hasOut = STATE.todayAttendance.some(r => r.action === 'OUT');
    if (!hasIn) STATE.currentStatus = 'none';
    else if (hasIn && !hasOut) STATE.currentStatus = 'clocked_in';
    else STATE.currentStatus = 'clocked_out';
  },
  async checkGeofence() {
    if (!STATE.assignedStore) { UI.setGeoStatus('no-store', 'No store assigned'); return; }
    if (!navigator.geolocation) { UI.setGeoStatus('unavailable', 'Geolocation not supported'); return; }
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'denied') { UI.setGeoStatus('error', 'Location blocked in browser settings. Enable it for this site.'); Staff.updatePunchButtons(); return; }
      if (perm.state === 'prompt') { UI.setGeoStatus('waiting', 'Your browser will ask for location permission shortly.'); }
    } catch {}
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      const acc = pos.coords.accuracy;
      STATE.geoPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      STATE.geoDistance = Utils.haversine(STATE.geoPosition.lat, STATE.geoPosition.lng, STATE.assignedStore.lat, STATE.assignedStore.lng);
      STATE.isWithinGeofence = STATE.geoDistance <= CONFIG.GEOFENCE_RADIUS;
      if (acc > CONFIG.GPS_ACCURACY_THRESHOLD) {
        UI.setGeoStatus('inaccurate', `Low accuracy (${acc.toFixed(0)}m). Position may be wrong.`);
      } else if (STATE.isWithinGeofence) {
        UI.setGeoStatus('within', `${STATE.geoDistance.toFixed(1)}m from ${STATE.assignedStore.name}`);
      } else {
        UI.setGeoStatus('outside', `${STATE.geoDistance.toFixed(1)}m from ${STATE.assignedStore.name}`);
      }
    } catch (e) {
      if (e.code === 1) UI.setGeoStatus('error', 'Location access denied.');
      else if (e.code === 2) UI.setGeoStatus('error', 'GPS unavailable.');
      else if (e.code === 3) UI.setGeoStatus('error', 'GPS timed out.');
      else UI.setGeoStatus('error', 'GPS error: ' + e.message);
    }
    Staff.updatePunchButtons();
  },
  async refreshLocation() {
    const hadSelfie = !!STATE.selfieDataUrl;
    STATE.selfieDataUrl = null; STATE.isWithinGeofence = false;
    if (hadSelfie) Utils.showToast('Selfie cleared — retake required', 'warning');
    UI.setGeoStatus('waiting', 'Refreshing location...');
    await Staff.checkGeofence();
  },
  async openCamera() {
    try {
      if (STATE.cameraStream) Staff.closeCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 400 } } });
      STATE.cameraStream = stream;
      const video = document.getElementById('selfie-video');
      video.srcObject = stream; video.classList.remove('hidden');
      document.getElementById('selfie-preview-area').classList.add('hidden');
      document.getElementById('btn-open-camera').classList.add('hidden');
      document.getElementById('btn-capture-selfie').classList.remove('hidden');
      document.getElementById('btn-retake-selfie').classList.add('hidden');
    } catch { Utils.showToast('Camera access denied.', 'error'); }
  },
  closeCamera() {
    if (STATE.cameraStream) { STATE.cameraStream.getTracks().forEach(t => t.stop()); STATE.cameraStream = null; }
    const video = document.getElementById('selfie-video');
    video.classList.add('hidden'); video.srcObject = null;
    document.getElementById('btn-open-camera').classList.remove('hidden');
    document.getElementById('btn-capture-selfie').classList.add('hidden');
    document.getElementById('btn-retake-selfie').classList.add('hidden');
  },
  captureSelfie() {
    const video = document.getElementById('selfie-video');
    const canvas = document.getElementById('selfie-canvas');
    canvas.width = 300; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, 0, 0, 300, 300);
    STATE.selfieDataUrl = canvas.toDataURL('image/jpeg', 0.75);
    document.getElementById('selfie-preview-img').src = STATE.selfieDataUrl;
    document.getElementById('selfie-preview-area').classList.remove('hidden');
    video.classList.add('hidden');
    document.getElementById('btn-capture-selfie').classList.add('hidden');
    document.getElementById('btn-retake-selfie').classList.remove('hidden');
    const badge = document.getElementById('selfie-badge');
    badge.className = 'badge badge-emerald'; badge.textContent = '✓ Captured';
    Staff.updatePunchButtons();
  },
  updatePunchButtons() {
    const btnIn = document.getElementById('btn-punch-in');
    const btnOut = document.getElementById('btn-punch-out');
    const canPunch = STATE.isWithinGeofence && STATE.selfieDataUrl && STATE.geoPosition && STATE.geoDistance !== null;
    const inGeoRange = STATE.isWithinGeofence;
    const hasInToday = STATE.todayAttendance.some(r => r.action === 'IN');
    const openShift = STATE.openShift || Staff.detectOpenShift();

    if (openShift) {
      const shiftTime = openShift.timestamp?.toMillis?.() || new Date(openShift.timestamp).getTime();
      const hoursOpen = (Date.now() - shiftTime) / 3600000;
      btnIn.disabled = true;
      btnOut.disabled = !(canPunch && inGeoRange);
      if (hoursOpen > CONFIG.SHIFT_AUTO_CLOSE_HOURS) {
        Staff.autoCloseShift(openShift);
        btnIn.disabled = !(canPunch && inGeoRange);
        btnOut.disabled = true;
      }
    } else if (hasInToday) {
      btnIn.disabled = true;
      btnOut.disabled = !(canPunch && inGeoRange);
    } else {
      btnIn.disabled = !(canPunch && inGeoRange);
      btnOut.disabled = true;
    }
  },
  async autoCloseShift(shiftRecord) {
    try {
      const employeeRecord = STATE.employeeRecord || STATE.employees.find(e => e.email === shiftRecord.email);
      // Use the shift's original date if available, otherwise today
      const closeDate = shiftRecord.date || Utils.getToday();
      await Firebase.db.collection('attendance').add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        date: closeDate,
        email: shiftRecord.email,
        name: employeeRecord ? employeeRecord.name : '',
        action: 'OUT',
        photo: '',
        gps: '',
        storeName: shiftRecord.storeName || '',
        deviceInfo: 'auto-close',
        autoClosed: true
      });
      Utils.showToast('⏰ Previous shift auto-closed (Absent).', 'warning');
    } catch (e) {
      console.error('autoCloseShift failed:', e);
      Utils.showToast('⚠️ Auto-close failed: ' + e.message, 'error');
    }
    STATE.openShift = null;
    Staff.updatePunchButtons();
  },
  showPunchConfirm(action) {
    if (!STATE.employeeRecord) { Utils.showToast('Not registered.', 'error'); return; }
    if (!STATE.selfieDataUrl) { Utils.showToast('Capture a selfie first', 'warning'); return; }
    if (!STATE.isWithinGeofence) { Utils.showToast('Outside geofence zone', 'warning'); return; }
    STATE.pendingPunchAction = action;
    document.getElementById('confirm-punch-title').textContent = action === 'IN' ? '✅ Confirm Punch In' : '❌ Confirm Punch Out';
    document.getElementById('confirm-punch-selfie').src = STATE.selfieDataUrl;
    document.getElementById('confirm-punch-action').textContent = action === 'IN' ? 'Punch In' : 'Punch Out';
    document.getElementById('confirm-punch-action').style.color = action === 'IN' ? 'var(--success)' : 'var(--danger)';
    document.getElementById('confirm-punch-store').textContent = STATE.assignedStore ? `📍 ${STATE.assignedStore.name}` : '📍 No store';
    document.getElementById('confirm-punch-time').textContent = `🕐 ${new Date().toLocaleString()}`;
    document.getElementById('confirm-punch-location').textContent = STATE.geoPosition ? `🌐 ${STATE.geoPosition.lat.toFixed(5)}, ${STATE.geoPosition.lng.toFixed(5)} · ±${Math.round(STATE.geoPosition.accuracy)}m` : '🌐 No GPS';
    document.getElementById('confirm-punch-overlay').classList.remove('hidden');
  },
  async confirmPunch() {
    if (STATE.punchInProgress) return;
    const action = STATE.pendingPunchAction;
    if (!action) return;
    STATE.punchInProgress = true;
    STATE.pendingPunchAction = null;
    document.getElementById('confirm-punch-overlay').classList.add('hidden');

    const openShift = STATE.openShift || Staff.detectOpenShift();
    if (action === 'IN' && openShift) {
      Utils.showToast('Complete your open shift first (Punch Out).', 'warning');
      return;
    }
    if (action === 'IN' && STATE.todayAttendance.some(r => r.action === 'IN')) {
      Utils.showToast('Already punched in today.', 'warning');
      return;
    }

    Utils.showLoading();
    try {
      await Firebase.db.collection('attendance').add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        date: Utils.getToday(),
        email: STATE.firebaseUser.email,
        name: STATE.employeeRecord.name,
        action,
        photo: STATE.selfieDataUrl,
        gps: STATE.geoPosition ? `${STATE.geoPosition.lat},${STATE.geoPosition.lng}` : '',
        storeName: STATE.assignedStore ? STATE.assignedStore.name : '',
        deviceInfo: Utils.getDeviceInfo()
      });
      Utils.showToast(`${action === 'IN' ? 'Punched In' : 'Punched Out'} ✓`);
      STATE.selfieDataUrl = null;
      document.getElementById('selfie-preview-area').classList.add('hidden');
      const badge = document.getElementById('selfie-badge');
      badge.className = 'badge badge-amber'; badge.textContent = 'Required';
      Staff.closeCamera();
      STATE.openShift = Staff.detectOpenShift();
      Staff.updatePunchButtons();
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { STATE.punchInProgress = false; Utils.hideLoading(); }
  },
  cancelPunchConfirm() {
    STATE.pendingPunchAction = null;
    document.getElementById('confirm-punch-overlay').classList.add('hidden');
  },
  checkOnline() {
    const bar = document.getElementById('offline-bar');
    if (!navigator.onLine) {
      bar.classList.remove('hidden');
      document.getElementById('offline-count').textContent = 'Firestore will sync when reconnected';
    } else { bar.classList.add('hidden'); }
  },
  calculateHoursWorked() {
    if (STATE.todayAttendance.length === 0 || STATE.currentStatus === 'none') return null;
    const punches = STATE.todayAttendance;
    let totalMs = 0, inTime = null;
    for (const p of punches) {
      if (p.action === 'IN') inTime = p.timestamp?.toMillis ? p.timestamp.toMillis() : new Date(p.timestamp).getTime();
      else if (p.action === 'OUT' && inTime !== null) {
        totalMs += (p.timestamp?.toMillis ? p.timestamp.toMillis() : new Date(p.timestamp).getTime()) - inTime;
        inTime = null;
      }
    }
    if (STATE.currentStatus === 'clocked_in' && inTime !== null) totalMs += Date.now() - inTime;
    return totalMs > 0 ? totalMs : null;
  }
};

const Admin = {
  async load() {
    Admin.updateStats();
    UI.renderStores();
    UI.renderEmployees();
    await DB.loadAllAttendance();
    UI.populateStoreDropdown();
    UI.populateYearDropdown();
    UI.populateStaffDropdowns();
    UI.setDefaultFilterDates();
  },
  updateStats() {
    const emailsInToday = new Set(STATE.todayAttendance.filter(r => r.action === 'IN').map(r => r.email));
    document.getElementById('stat-today').textContent = emailsInToday.size;
    const totalEmps = STATE.employees.length;
    const absentCount = totalEmps > 0 ? totalEmps - emailsInToday.size : 0;
    document.getElementById('stat-absent').textContent = absentCount;
    const openCount = STATE.allAttendanceRaw.length > 0
      ? STATE.employees.filter(e => {
          const recs = STATE.allAttendanceRaw.filter(r => r.email === e.email);
          recs.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
          let inOpen = false;
          for (const r of recs) { if (r.action === 'IN') inOpen = true; else if (r.action === 'OUT') inOpen = false; }
          return inOpen;
        }).length
      : 0;
    document.getElementById('stat-open').textContent = openCount;
    document.getElementById('stat-stores').textContent = STATE.stores.length;
    document.getElementById('stat-employees').textContent = STATE.employees.length;
  },
  async exportCSV() {
    await DB.loadAllAttendance();
    if (STATE.allAttendanceRaw.length === 0) { Utils.showToast('No records', 'info'); return; }
    const headers = ['Date', 'Time', 'Email', 'Name', 'Action', 'GPS', 'Store', 'Device'];
    const rows = STATE.allAttendanceRaw.map(r => [
      r.date, Utils.formatTime(r.timestamp), r.email, r.name || '', r.action,
      r.gps || '', r.storeName || '', (r.deviceInfo || '').substring(0, 50)
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${Utils.getToday()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    Utils.showToast('CSV exported ✓');
  }
};

const UI = {
  showView(view) {
    if (view === 'admin') {
      const stored = Utils.getStoredAdminPassword();
      if (!stored) { UI.showAdminPwdSetup(); }
      else { UI.showAdminPwdVerify(); }
      return;
    }
    STATE.view = view;
    document.getElementById('employee-view').classList.toggle('hidden', view !== 'employee');
    document.getElementById('admin-view').classList.toggle('hidden', view !== 'admin');
    document.getElementById('btn-switch-admin').classList.toggle('hidden', !(STATE.isOwner && view === 'employee'));
    document.getElementById('btn-switch-employee').classList.toggle('hidden', !(STATE.isOwner && view === 'admin'));
    if (view === 'admin') { Admin.load(); UI.switchAdminTab('records'); }
    if (view === 'employee') { Staff.updateAssignedStore(); UI.renderEmployeeView(); }
    UI.updateHeaderStoreName();
  },
  showAdminPwdSetup() {
    document.getElementById('admin-pwd-title').textContent = '🔐 Set Admin Password';
    document.getElementById('admin-pwd-desc').textContent = 'Set a password to protect admin access.';
    document.getElementById('admin-pwd-setup-area').classList.remove('hidden');
    document.getElementById('admin-pwd-setup-hint').classList.remove('hidden');
    document.getElementById('admin-password-input').value = '';
    document.getElementById('admin-pwd-confirm').value = '';
    const labels = { min: 'At least 8 characters', upper: 'At least 1 uppercase letter', lower: 'At least 1 lowercase letter', number: 'At least 1 number', special: 'At least 1 special character' };
    document.getElementById('admin-pwd-reqs').querySelectorAll('.req').forEach(r => { r.className = 'req unmet'; r.textContent = '✕ ' + (labels[r.dataset.req] || r.dataset.req); });
    document.getElementById('admin-pwd-reqs').classList.remove('hidden');
    document.getElementById('admin-pwd-overlay').classList.remove('hidden');
    document.getElementById('admin-password-input').focus();
  },
  showAdminPwdVerify() {
    document.getElementById('admin-pwd-title').textContent = '🔒 Admin Access';
    document.getElementById('admin-pwd-desc').textContent = 'Enter admin password to continue.';
    document.getElementById('admin-pwd-setup-area').classList.add('hidden');
    document.getElementById('admin-pwd-setup-hint').classList.add('hidden');
    document.getElementById('admin-password-input').value = '';
    document.getElementById('admin-pwd-overlay').classList.remove('hidden');
    document.getElementById('admin-password-input').focus();
  },
  closeAdminPwdModal() { document.getElementById('admin-pwd-overlay').classList.add('hidden'); },
  async handleAdminPwdSubmit() {
    const input = document.getElementById('admin-password-input');
    const password = input.value;
    const stored = Utils.getStoredAdminPassword();
    if (!stored) {
      const confirm = document.getElementById('admin-pwd-confirm').value;
      const { allMet } = Utils.validatePassword(password);
      if (!allMet) { Utils.showToast('Password does not meet requirements', 'warning'); return; }
      if (password !== confirm) { Utils.showToast('Passwords do not match', 'warning'); return; }
      await Utils.setStoredAdminPassword(password);
      Utils.showToast('Admin password set ✓', 'success');
      UI.closeAdminPwdModal();
      UI.enterAdminView();
    } else {
      if (!password) { Utils.showToast('Enter admin password', 'warning'); return; }
      if (!(await Utils.verifyAdminPassword(password))) { Utils.showToast('Incorrect admin password', 'error'); input.value = ''; input.focus(); return; }
      UI.closeAdminPwdModal();
      UI.enterAdminView();
    }
  },
  enterAdminView() {
    STATE.view = 'admin';
    document.getElementById('employee-view').classList.add('hidden');
    document.getElementById('admin-view').classList.remove('hidden');
    document.getElementById('btn-switch-admin').classList.add('hidden');
    document.getElementById('btn-switch-employee').classList.remove('hidden');
    Admin.load();
    UI.switchAdminTab('records');
    UI.updateHeaderStoreName();
  },
  renderEmployeeView() {
    if (!STATE.isRegistered) {
      document.getElementById('emp-store').textContent = 'Not Registered';
      document.getElementById('emp-store').style.color = 'var(--danger)';
      document.getElementById('emp-status-text').textContent = 'Contact Admin';
      document.getElementById('emp-status-text').className = 'status-text status-text-idle';
      document.getElementById('emp-trusted-time').textContent = 'Your email is not in the employee list';
      document.getElementById('emp-status-dot').className = 'status-dot';
      document.getElementById('emp-hours-today').style.display = 'none';
      return;
    }
    Staff.updateAssignedStore();
    document.getElementById('emp-store').textContent = STATE.assignedStore ? STATE.assignedStore.name : 'No store assigned';
    document.getElementById('emp-store').style.color = '';
    const textEl = document.getElementById('emp-status-text');
    const dotEl = document.getElementById('emp-status-dot');
    const timeEl = document.getElementById('emp-trusted-time');
    const hoursEl = document.getElementById('emp-hours-today');
    const openShift = STATE.openShift || Staff.detectOpenShift();

    if (openShift) {
      textEl.textContent = `Shift Started at ${Utils.formatTime(openShift.timestamp)} (${openShift.date})`;
      textEl.className = 'status-text status-text-in';
      dotEl.className = 'status-dot status-dot-active';
    } else if (STATE.currentStatus === 'clocked_in') {
      const last = STATE.todayAttendance[STATE.todayAttendance.length - 1];
      textEl.textContent = `Shift Started at ${Utils.formatTime(last.timestamp)}`;
      textEl.className = 'status-text status-text-in';
      dotEl.className = 'status-dot status-dot-active';
    } else if (STATE.currentStatus === 'clocked_out') {
      const last = STATE.todayAttendance[STATE.todayAttendance.length - 1];
      textEl.textContent = `Shift Ended at ${Utils.formatTime(last.timestamp)}`;
      textEl.className = 'status-text status-text-out';
      dotEl.className = 'status-dot';
    } else {
      textEl.textContent = 'Shift Not Started';
      textEl.className = 'status-text status-text-idle';
      dotEl.className = 'status-dot';
    }
    timeEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const worked = Staff.calculateHoursWorked();
    if (worked !== null) { hoursEl.textContent = `⏱ ${Utils.msToHours(worked)} worked today`; hoursEl.style.display = 'block'; }
    else { hoursEl.style.display = 'none'; }
    Staff.checkGeofence();
    Staff.checkOnline();
    UI.renderAttendanceHistory();
    UI.renderOpenShiftBar();
    App.checkReminders();
  },
  renderOpenShiftBar() {
    const bar = document.getElementById('open-shift-bar');
    const openShift = STATE.openShift || Staff.detectOpenShift();
    if (openShift) {
      const shiftTime = openShift.timestamp?.toMillis?.() || new Date(openShift.timestamp).getTime();
      const hoursOpen = (Date.now() - shiftTime) / 3600000;
      document.getElementById('open-shift-time').textContent = `${Utils.formatTime(openShift.timestamp)} (${Utils.msToHours(Date.now() - shiftTime)} ago)`;
      bar.classList.remove('hidden');
      if (hoursOpen > CONFIG.SHIFT_AUTO_CLOSE_HOURS) {
        Staff.autoCloseShift(openShift);
        bar.classList.add('hidden');
      }
    } else { bar.classList.add('hidden'); }
  },
  setGeoStatus(status, detail) {
    const icon = document.getElementById('emp-geo-icon');
    const statusEl = document.getElementById('emp-geo-status');
    const detailEl = document.getElementById('emp-geo-detail');
    if (status === 'within') { icon.textContent = '✅'; statusEl.textContent = '✓ Within geofence'; statusEl.style.color = 'var(--success)'; }
    else if (status === 'outside') { icon.textContent = '❌'; statusEl.textContent = `✕ ${STATE.geoDistance.toFixed(0)}m away (limit ${CONFIG.GEOFENCE_RADIUS}m)`; statusEl.style.color = 'var(--danger)'; }
    else if (status === 'inaccurate') { icon.textContent = '⚠️'; statusEl.textContent = '⚠ Low accuracy location'; statusEl.style.color = 'var(--warning)'; }
    else if (status === 'waiting') { icon.textContent = '⏳'; statusEl.textContent = 'Requesting GPS...'; statusEl.style.color = 'var(--gray-500)'; }
    else if (status === 'no-store') { icon.textContent = '⚠️'; statusEl.textContent = 'No store assigned'; statusEl.style.color = 'var(--warning)'; }
    else if (status === 'error') { icon.textContent = '⚠️'; statusEl.textContent = 'Location unavailable'; statusEl.style.color = 'var(--warning)'; }
    else { icon.textContent = '⏳'; statusEl.textContent = 'Checking location...'; statusEl.style.color = 'var(--gray-500)'; }
    detailEl.textContent = detail || '';
    Staff.updatePunchButtons();
  },
  renderAttendanceHistory() {
    const container = document.getElementById('attendance-history');
    const badge = document.getElementById('today-count-badge');
    if (STATE.todayAttendance.length === 0) {
      container.innerHTML = '<p class="empty-state">No records for today</p>';
      badge.classList.add('hidden'); return;
    }
    badge.textContent = `${STATE.todayAttendance.length} records`;
    badge.classList.remove('hidden');
    container.innerHTML = STATE.todayAttendance.map(r =>
      `<div class="flex items-center justify-between p-2" style="border-bottom:1px solid var(--gray-100);">
        <div class="flex items-center gap-2">
          <span style="font-size:1.25rem;">${r.action === 'IN' ? '✅' : '❌'}</span>
          <div>
            <span style="font-weight:600;font-size:0.875rem;">${r.action === 'IN' ? 'Punched In' : 'Punched Out'}</span>
            <span style="font-size:0.75rem;color:var(--gray-400);margin-left:0.5rem;">${Utils.formatTime(r.timestamp)}</span>
          </div>
        </div>
        <span style="font-size:0.75rem;color:var(--gray-400);">${Utils.escapeHtml(r.storeName || '')}</span>
      </div>`
    ).join('');
  },
  renderStores() {
    const list = document.getElementById('store-list');
    if (STATE.stores.length === 0) { list.innerHTML = '<p class="empty-state">No stores yet. Add one above.</p>'; return; }
    list.innerHTML = STATE.stores.map(s =>
      `<div class="list-item" data-id="${Utils.escapeAttr(s.id)}">
        <div class="list-item-content">
          <div class="list-item-title"><span class="store-name-text" data-id="${Utils.escapeAttr(s.id)}">${Utils.escapeHtml(s.name)}</span><input class="inline-edit-input hidden store-name-input" data-id="${Utils.escapeAttr(s.id)}" value="${Utils.escapeAttr(s.name)}"></div>
          <div class="list-item-sub"><span class="store-lat-text" data-id="${Utils.escapeAttr(s.id)}">${Utils.escapeHtml(s.lat)}</span><input class="inline-edit-input hidden store-lat-input" data-id="${Utils.escapeAttr(s.id)}" value="${Utils.escapeAttr(s.lat)}" type="number" step="any">, <span class="store-lng-text" data-id="${Utils.escapeAttr(s.id)}">${Utils.escapeHtml(s.lng)}</span><input class="inline-edit-input hidden store-lng-input" data-id="${Utils.escapeAttr(s.id)}" value="${Utils.escapeAttr(s.lng)}" type="number" step="any"></div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-sm btn-primary edit-store" data-id="${Utils.escapeAttr(s.id)}" data-name="${Utils.escapeAttr(s.name)}" data-lat="${Utils.escapeAttr(s.lat)}" data-lng="${Utils.escapeAttr(s.lng)}">Edit</button>
          <button class="btn btn-sm btn-danger delete-store" data-id="${Utils.escapeAttr(s.id)}">Del</button>
        </div>
      </div>`
    ).join('');
  },
  renderEmployees() {
    const list = document.getElementById('emp-list');
    if (STATE.employees.length === 0) { list.innerHTML = '<p class="empty-state">No employees yet. Add one above.</p>'; return; }
    list.innerHTML = STATE.employees.map(e =>
      `<div class="list-item" data-email="${Utils.escapeAttr(e.email)}">
        <div class="list-item-content">
          <div class="list-item-title"><span class="emp-name-text" data-email="${Utils.escapeAttr(e.email)}">${Utils.escapeHtml(e.name)}</span><input class="inline-edit-input hidden emp-name-input" data-email="${Utils.escapeAttr(e.email)}" value="${Utils.escapeAttr(e.name)}"></div>
          <div class="list-item-sub">${Utils.escapeHtml(e.email)} · <span class="emp-store-text" data-email="${Utils.escapeAttr(e.email)}">${Utils.escapeHtml(Utils.getStoreName(e.storeId))}</span>
            <select class="inline-edit-input hidden emp-store-input" data-email="${Utils.escapeAttr(e.email)}"><option value="">Select</option>${STATE.stores.map(s => `<option value="${Utils.escapeAttr(s.id)}" ${s.id === e.storeId ? 'selected' : ''}>${Utils.escapeHtml(s.name)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-sm btn-primary edit-emp" data-email="${Utils.escapeAttr(e.email)}" data-name="${Utils.escapeAttr(e.name)}" data-store="${Utils.escapeAttr(e.storeId)}">Edit</button>
          <button class="btn btn-sm btn-danger delete-emp" data-email="${Utils.escapeAttr(e.email)}">Del</button>
        </div>
      </div>`
    ).join('');
  },
  renderAdminAttendance() {
    const body = document.getElementById('admin-attendance-body');
    const from = document.getElementById('filter-date-from').value;
    const to = document.getElementById('filter-date-to').value;
    const staffEmail = document.getElementById('filter-staff').value;
    let filtered = STATE.attendance;
    if (from) filtered = filtered.filter(r => r.date >= from);
    if (to) filtered = filtered.filter(r => r.date <= to);
    if (staffEmail) filtered = filtered.filter(r => r.email === staffEmail);
    STATE.filterActive = !!(from || to || staffEmail);
    document.getElementById('filter-result-count').textContent = `${STATE.attendancePage * CONFIG.PAGE_SIZE + 1}-${Math.min((STATE.attendancePage + 1) * CONFIG.PAGE_SIZE, STATE.attendanceTotal)} of ${STATE.attendanceTotal} records`;
    if (filtered.length === 0) {
      body.innerHTML = '<tr><td colspan="8" class="text-center" style="color:var(--gray-400);padding:1rem;">No records</td></tr>'; return;
    }
    const grouped = {};
    filtered.forEach(r => { const key = r.email || 'unknown'; if (!grouped[key]) grouped[key] = []; grouped[key].push(r); });
    const sortedEmails = Object.keys(grouped).sort();
    let html = '';
    sortedEmails.forEach(email => {
      const recs = grouped[email].sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
      const staffName = recs[0].name || email;
      html += `<tr class="attendance-group-header"><td colspan="8">👤 ${Utils.escapeHtml(staffName)} (${recs.length} records)</td></tr>`;
      recs.forEach(r => {
        const hasPhoto = !!(r.photo && r.photo.length > 100);
        const safePhotoUrl = hasPhoto ? Utils.sanitizePhotoUrl(r.photo) : '';
        const actionColor = r.action === 'IN' ? 'var(--success)' : 'var(--danger)';
        html += `<tr>
          <td>${hasPhoto && safePhotoUrl ? `<img class="photo-thumb view-photo" src="${Utils.escapeAttr(safePhotoUrl)}" alt="selfie" data-id="${Utils.escapeAttr(r.id)}" style="cursor:pointer;" title="View photo">` : '<span style="color:var(--gray-300);font-size:0.75rem;">—</span>'}</td>
          <td>${Utils.escapeHtml(r.date)}</td><td>${Utils.formatTime(r.timestamp)}</td>
          <td>${Utils.escapeHtml(r.name || '—')}</td><td style="font-size:0.75rem;color:var(--gray-400);">${Utils.escapeHtml(r.email || '—')}</td>
          <td><span style="color:${actionColor};font-weight:600;">${Utils.escapeHtml(r.action)}</span></td>
          <td>${Utils.escapeHtml(r.storeName || '—')}</td>
          <td><div class="flex gap-1" style="flex-wrap:nowrap;">
            ${hasPhoto && safePhotoUrl ? `<button class="btn action-btn btn-outline view-photo-btn" data-id="${Utils.escapeAttr(r.id)}" title="View selfie">📷</button>` : ''}
            <button class="btn action-btn btn-primary edit-att-btn" data-id="${Utils.escapeAttr(r.id)}" data-action="${Utils.escapeAttr(r.action)}" data-name="${Utils.escapeAttr(r.name || r.email)}" data-date="${Utils.escapeAttr(r.date)}" data-time="${Utils.escapeAttr(Utils.formatTime(r.timestamp))}" title="Edit">✏️</button>
            <button class="btn action-btn btn-danger delete-att-btn" data-id="${Utils.escapeAttr(r.id)}" title="Delete">🗑️</button>
          </div></td>
        </tr>`;
      });
    });
    body.innerHTML = html;
  },
  updatePagination() {
    const totalPages = Math.ceil(STATE.attendanceTotal / CONFIG.PAGE_SIZE);
    const controls = document.getElementById('pagination-controls');
    if (totalPages <= 1 && !STATE.filterActive) { controls.classList.add('hidden'); return; }
    controls.classList.remove('hidden');
    document.getElementById('page-info').textContent = `Page ${STATE.attendancePage + 1} of ${Math.max(1, totalPages)}`;
  },
  populateStoreDropdown() {
    const select = document.getElementById('input-emp-store');
    if (!select) return;
    const val = select.value;
    select.innerHTML = '<option value="">Select Store</option>';
    STATE.stores.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; select.appendChild(o); });
    if (val) select.value = val;
  },
  showPhotoModal(id) {
    const record = STATE.allAttendanceRaw.find(r => r.id === id) || STATE.attendance.find(r => r.id === id) || STATE.todayAttendance.find(r => r.id === id);
    if (!record || !record.photo) { Utils.showToast('No photo available', 'info'); return; }
    const safeUrl = Utils.sanitizePhotoUrl(record.photo);
    if (!safeUrl) { Utils.showToast('Invalid photo data', 'error'); return; }
    document.getElementById('photo-modal-img').src = safeUrl;
    document.getElementById('photo-modal-info').textContent = `${record.name || record.email} · ${record.date} ${Utils.formatTime(record.timestamp)}`;
    document.getElementById('photo-overlay').classList.remove('hidden');
  },
  closePhotoModal() { document.getElementById('photo-overlay').classList.add('hidden'); document.getElementById('photo-modal-img').src = ''; },
  showEditModal(id) {
    const record = STATE.allAttendanceRaw.find(r => r.id === id) || STATE.attendance.find(r => r.id === id);
    if (!record) { Utils.showToast('Record not found', 'error'); return; }
    STATE.editingAttendanceId = id;
    document.getElementById('edit-modal-desc').textContent = `${record.name || record.email} · ${record.date} ${Utils.formatTime(record.timestamp)}`;
    document.getElementById('edit-action-select').value = record.action;
    const ts = record.timestamp?.toMillis ? new Date(record.timestamp.toMillis()) : new Date(record.timestamp);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('edit-timestamp').value = `${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())}T${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
    document.getElementById('edit-modal-overlay').classList.remove('hidden');
  },
  closeEditModal() { document.getElementById('edit-modal-overlay').classList.add('hidden'); STATE.editingAttendanceId = null; },
  applyFilter() { if (STATE.view === 'admin') UI.renderAdminAttendance(); },
  clearFilter() {
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    document.getElementById('filter-staff').value = '';
    STATE.filterActive = false;
    DB.loadAllAttendance();
  },
  populateStaffDropdowns() {
    const selects = ['filter-staff', 'report-staff', 'cal-staff-filter'];
    selects.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const val = sel.value;
      sel.innerHTML = '<option value="">All Staff</option>';
      STATE.employees.forEach(e => { const o = document.createElement('option'); o.value = e.email; o.textContent = `${e.name} (${e.email})`; sel.appendChild(o); });
      if (val) sel.value = val;
    });
  },
  populateYearDropdown() {
    const sel = document.getElementById('report-year');
    if (!sel) return;
    const now = new Date(), current = now.getFullYear();
    sel.innerHTML = '';
    for (let y = current - 2; y <= current + 1; y++) { const o = document.createElement('option'); o.value = y; o.textContent = y; if (y === current) o.selected = true; sel.appendChild(o); }
    document.getElementById('report-month').value = String(now.getMonth() + 1).padStart(2, '0');
  },
  setDefaultFilterDates() {
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    document.getElementById('filter-date-from').value = `${y}-${m}-01`;
    document.getElementById('filter-date-to').value = `${y}-${m}-${d}`;
  },
  updateHeaderStoreName() {
    const el = document.getElementById('header-app-name');
    if (STATE.employeeRecord && STATE.assignedStore) el.textContent = STATE.assignedStore.name;
    else el.textContent = 'Geo Attend Pro';
  },
  switchAdminTab(tab) {
    document.getElementById('admin-records-view').classList.toggle('hidden', tab !== 'records');
    document.getElementById('admin-calendar-view').classList.toggle('hidden', tab !== 'calendar');
    document.getElementById('admin-mgmt-view').classList.toggle('hidden', tab !== 'management');
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    if (tab === 'calendar') UI.renderCalendar();
  },
  showReportPopup(records, staffEmail, year, month) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthName = monthNames[parseInt(month) - 1];
    const staffName = staffEmail ? (STATE.employees.find(e => e.email === staffEmail)?.name || staffEmail) : 'All Staff';
    document.getElementById('report-popup-title').textContent = `📅 ${monthName} ${year} — ${staffName}`;
    const allDates = Utils.getMonthDays(year, month);
    let employeesToShow = staffEmail ? STATE.employees.filter(e => e.email === staffEmail) : STATE.employees;
    if (employeesToShow.length === 0 && records.length > 0) {
      const emails = [...new Set(records.map(r => r.email))];
      employeesToShow = emails.map(e => ({ email: e, name: records.find(r => r.email === e)?.name || e }));
    }
    const body = document.getElementById('report-popup-body');
    if (records.length === 0 && employeesToShow.length === 0) {
      body.innerHTML = '<p class="empty-state">No records for this period</p>';
      document.getElementById('report-popup-summary').innerHTML = '<strong>No data</strong>';
      document.getElementById('report-overlay').classList.remove('hidden'); return;
    }
    const todayStr = Utils.getToday();
    let detailHtml = '<table class="report-table"><thead><tr><th>Staff</th><th>Date</th><th>Status</th><th>Actions</th><th>Store</th></tr></thead><tbody>';
    let totalPresent = 0, totalAbsent = 0, totalWorking = 0, totalDays = 0;
    employeesToShow.forEach(emp => {
      allDates.forEach(date => {
        // L1: String comparison works for YYYY-MM-DD format (lexicographically sortable)
        if (date > todayStr) return;
        const dayRecords = records.filter(r => r.email === emp.email && r.date === date);
        const status = Utils.computeAttendanceStatus(dayRecords, emp.email);
        const statusLabel = status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : 'Working';
        const statusClass = status === 'present' ? 'status-present' : status === 'absent' ? 'status-absent' : 'status-working';
        if (status === 'present') totalPresent++;
        else if (status === 'absent') totalAbsent++;
        else totalWorking++;
        totalDays++;
        let actionHtml = '—';
        if (dayRecords.length > 0) {
          const last = dayRecords[dayRecords.length - 1];
          actionHtml = `<span style="font-size:0.75rem;">${Utils.escapeHtml(last.action)} ${Utils.formatTime(last.timestamp)}</span>`;
          const safePhotoUrl = last.photo ? Utils.sanitizePhotoUrl(last.photo) : '';
          if (safePhotoUrl) actionHtml += `<img class="report-photo-thumb view-photo ml-1" src="${Utils.escapeAttr(safePhotoUrl)}" alt="selfie" data-id="${Utils.escapeAttr(last.id)}" style="display:inline-block;vertical-align:middle;">`;
        }
        const storeName = dayRecords.length > 0 ? (dayRecords[0].storeName || '—') : (Utils.getStoreName(emp.storeId) || '—');
        detailHtml += `<tr><td style="font-weight:600;font-size:0.8125rem;">${Utils.escapeHtml(emp.name || emp.email)}</td><td style="font-size:0.8125rem;">${Utils.escapeHtml(date)}</td><td><span class="${Utils.escapeAttr(statusClass)}">${Utils.escapeHtml(statusLabel)}</span></td><td>${actionHtml}</td><td style="font-size:0.75rem;color:var(--gray-500);">${Utils.escapeHtml(storeName)}</td></tr>`;
      });
    });
    detailHtml += '</tbody></table>';
    const uniqueStaff = employeesToShow.length;
    document.getElementById('report-popup-summary').innerHTML = `<strong>${uniqueStaff} employee(s)</strong> · ${totalDays} entries · <span class="status-present">${totalPresent} Present</span> · <span class="status-absent">${totalAbsent} Absent</span>` + (totalWorking > 0 ? ` · <span class="status-working">${totalWorking} Working</span>` : '');
    body.innerHTML = detailHtml;
    body.querySelectorAll('.view-photo').forEach(el => {
      el.addEventListener('click', e => {
        const rid = e.currentTarget.dataset.id;
        const rec = records.find(x => x.id === rid);
        if (rec && rec.photo) { const safeUrl = Utils.sanitizePhotoUrl(rec.photo); if (safeUrl) { document.getElementById('photo-modal-img').src = safeUrl; document.getElementById('photo-modal-info').textContent = `${rec.name || rec.email} · ${rec.date} ${Utils.formatTime(rec.timestamp)}`; document.getElementById('photo-overlay').classList.remove('hidden'); } }
      });
    });
    document.getElementById('report-overlay').classList.remove('hidden');
  },
  closeReportPopup() {
    document.getElementById('report-overlay').classList.add('hidden');
    document.getElementById('report-popup-body').innerHTML = '<p class="empty-state">No records</p>';
  },
  async renderCalendar() {
    const now = new Date();
    STATE.calMonth = STATE.calMonth || now.getMonth() + 1;
    STATE.calYear = STATE.calYear || now.getFullYear();
    const staffEmail = document.getElementById('cal-staff-filter')?.value || '';
    document.getElementById('cal-month-label').textContent = new Date(STATE.calYear, STATE.calMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const records = await DB.loadCalendarData(STATE.calYear, STATE.calMonth, staffEmail);
    const allDates = Utils.getMonthDays(String(STATE.calYear), String(STATE.calMonth).padStart(2, '0'));
    let employeesToShow = staffEmail ? STATE.employees.filter(e => e.email === staffEmail) : STATE.employees;
    if (employeesToShow.length === 0) {
      document.getElementById('calendar-grid').innerHTML = '<p class="empty-state">No employees found</p>'; return;
    }
    const todayStr = Utils.getToday();
    let html = '<table><thead><tr><th style="text-align:left;min-width:100px;">Staff</th>';
    allDates.forEach(date => {
      const dayNum = parseInt(date.split('-')[2]);
      const isToday = date === todayStr;
      html += `<th style="${isToday ? 'color:var(--primary-light);' : ''}">${dayNum}</th>`;
    });
    html += '</tr></thead><tbody>';
    employeesToShow.forEach(emp => {
      html += `<tr><td class="cal-staff-name">${Utils.escapeHtml(emp.name || emp.email)}</td>`;
      allDates.forEach(date => {
        // L1: String comparison works for YYYY-MM-DD format (lexicographically sortable)
        if (date > todayStr) { html += '<td>—</td>'; return; }
        const dayRecords = records.filter(r => r.email === emp.email && r.date === date);
        const status = Utils.computeAttendanceStatus(dayRecords, emp.email);
        const dotClass = status === 'present' ? 'cal-dot-present' : status === 'absent' ? 'cal-dot-absent' : status === 'working' ? 'cal-dot-working' : 'cal-dot-none';
        const dotTitle = status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : status === 'working' ? 'Working' : 'No data';
        html += `<td><span class="cal-dot ${dotClass}" title="${dotTitle}"></span></td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    document.getElementById('calendar-grid').innerHTML = html;
  },
  calPrevMonth() {
    STATE.calMonth--;
    if (STATE.calMonth < 1) { STATE.calMonth = 12; STATE.calYear--; }
    UI.renderCalendar();
  },
  calNextMonth() {
    STATE.calMonth++;
    if (STATE.calMonth > 12) { STATE.calMonth = 1; STATE.calYear++; }
    UI.renderCalendar();
  }
};

const App = {
  init() {
    this.bindEvents();
    const loadingEl = document.getElementById('loading-overlay');
    const hideLoading = () => loadingEl.classList.add('hidden');
    // L4: Show error if Firebase hasn't initialized after 8s
    setTimeout(() => {
      if (!loadingEl.classList.contains('hidden')) {
        hideLoading();
        document.querySelector('.login-box h2').textContent = '⚠️ Initialization Timeout';
        document.getElementById('login-form').innerHTML = '<div class="msg-box"><p class="msg-box-title">❌ App failed to initialize</p><p class="msg-box-text">Firebase connection timed out. Please check your internet connection and reload.</p></div>';
      }
    }, 8000);
    if (CONFIG.firebaseConfig.apiKey === 'YOUR_API_KEY' || CONFIG.firebaseConfig.apiKey.length < 10) {
      hideLoading();
      document.querySelector('.login-box h2').textContent = '⚠️ Configuration Required';
      document.querySelector('.login-box > p').innerHTML = 'Open <code>js/app.js</code> and replace the <code>firebaseConfig</code> values with your Firebase project config.';
      document.getElementById('login-form').innerHTML = '<div class="msg-box"><p class="msg-box-title">❌ Firebase not configured</p><p class="msg-box-text">Your <code>firebaseConfig</code> still has placeholder values.</p></div>';
      return;
    }
    try { Firebase.init(); }
    catch (e) {
      hideLoading();
      document.getElementById('login-form').innerHTML = '<div class="msg-box"><p class="msg-box-title">❌ Firebase init failed</p><p class="msg-box-text">' + e.message + '</p></div>';
    }
    // M13: Check online status on init
    Staff.checkOnline();
  },
  startReminders() {
    App.stopReminders();
    STATE.reminderInterval = setInterval(() => App.checkReminders(), CONFIG.REMINDER_CHECK_INTERVAL);
  },
  stopReminders() {
    if (STATE.reminderInterval) { clearInterval(STATE.reminderInterval); STATE.reminderInterval = null; }
  },
  checkReminders() {
    if (STATE.view !== 'employee' || !STATE.isRegistered) return;
    const openShift = STATE.openShift || Staff.detectOpenShift();
    const banner = document.getElementById('reminder-banner');
    const bannerText = document.getElementById('reminder-banner-text');
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    if (openShift) {
      const shiftTime = openShift.timestamp?.toMillis?.() || new Date(openShift.timestamp).getTime();
      const hoursOpen = (Date.now() - shiftTime) / 3600000;
      if (hoursOpen >= CONFIG.REMINDER_HOURS_OPEN) {
        bannerText.textContent = `⏰ You've been clocked in for ${Utils.msToHours(Date.now() - shiftTime)}. Remember to punch out!`;
        banner.classList.remove('hidden'); return;
      }
    }
    if (timeStr >= CONFIG.DAILY_REMINDER_IN && timeStr <= '07:10' && !openShift && !STATE.todayAttendance.some(r => r.action === 'IN')) {
      bannerText.textContent = '⏰ Good morning! Time to punch in for your shift.';
      banner.classList.remove('hidden'); return;
    }
    if (timeStr >= CONFIG.DAILY_REMINDER_OUT && timeStr <= '19:10' && openShift) {
      bannerText.textContent = '⏰ End of day — remember to punch out!';
      banner.classList.remove('hidden'); return;
    }
    banner.classList.add('hidden');
  },
  bindEvents() {
    document.getElementById('btn-login').addEventListener('click', () => Auth.login());
    document.getElementById('link-show-register').addEventListener('click', e => { e.preventDefault(); Auth.showRegister(); });
    document.getElementById('link-show-login').addEventListener('click', e => { e.preventDefault(); Auth.showLogin(); });
    document.getElementById('link-forgot-password').addEventListener('click', e => { e.preventDefault(); Auth.forgotPassword(); });
    document.getElementById('btn-register').addEventListener('click', () => Auth.register());
    document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') Auth.login(); });
    document.getElementById('reg-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') Auth.register(); });
    document.getElementById('btn-logout').addEventListener('click', () => Auth.logout());
    document.getElementById('btn-switch-admin').addEventListener('click', () => UI.showView('admin'));
    document.getElementById('btn-switch-employee').addEventListener('click', () => UI.showView('employee'));
    document.getElementById('logo-home').addEventListener('click', () => { if (STATE.firebaseUser) UI.showView('employee'); });
    document.querySelector('.admin-tabs').addEventListener('click', e => {
      const tab = e.target.closest('.admin-tab');
      if (tab) { UI.switchAdminTab(tab.dataset.tab); }
    });

    document.getElementById('btn-show-store-form').addEventListener('click', () => {
      STATE.editingStoreId = null;
      ['input-store-name', 'input-store-lat', 'input-store-lng'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('store-form-area').classList.toggle('hidden');
    });
    document.getElementById('btn-cancel-store').addEventListener('click', () => {
      document.getElementById('store-form-area').classList.add('hidden');
      STATE.editingStoreId = null;
    });
    document.getElementById('btn-save-store').addEventListener('click', () => {
      const name = document.getElementById('input-store-name').value.trim();
      const lat = parseFloat(document.getElementById('input-store-lat').value);
      const lng = parseFloat(document.getElementById('input-store-lng').value);
      // M14: Validation
      if (!name) { Utils.showToast('Store name is required', 'warning'); return; }
      if (isNaN(lat) || lat < -90 || lat > 90) { Utils.showToast('Latitude must be between -90 and 90', 'warning'); return; }
      if (isNaN(lng) || lng < -180 || lng > 180) { Utils.showToast('Longitude must be between -180 and 180', 'warning'); return; }
      if (STATE.editingStoreId) { DB.updateStore(STATE.editingStoreId, { name, lat, lng }); STATE.editingStoreId = null; }
      else { DB.addStore(name, lat, lng); }
      document.getElementById('store-form-area').classList.add('hidden');
      ['input-store-name', 'input-store-lat', 'input-store-lng'].forEach(id => document.getElementById(id).value = '');
    });

    document.getElementById('btn-show-emp-form').addEventListener('click', () => {
      STATE.editingEmpEmail = null;
      document.getElementById('input-emp-name').value = '';
      document.getElementById('input-emp-email').value = '';
      UI.populateStoreDropdown();
      document.getElementById('emp-form-area').classList.toggle('hidden');
    });
    document.getElementById('btn-cancel-emp').addEventListener('click', () => {
      document.getElementById('emp-form-area').classList.add('hidden');
      STATE.editingEmpEmail = null;
    });
    document.getElementById('btn-save-emp').addEventListener('click', () => {
      const name = document.getElementById('input-emp-name').value.trim();
      const email = document.getElementById('input-emp-email').value.trim().toLowerCase();
      const storeId = document.getElementById('input-emp-store').value;
      // M15: Validate email format
      if (!name) { Utils.showToast('Employee name is required', 'warning'); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { Utils.showToast('Valid email is required', 'warning'); return; }
      if (!storeId) { Utils.showToast('Please select a store', 'warning'); return; }
      // M15: Check for duplicate email (for new employees only)
      if (!STATE.editingEmpEmail && STATE.employees.some(e => e.email === email)) {
        Utils.showToast('Employee with this email already exists', 'warning'); return;
      }
      if (STATE.editingEmpEmail) { DB.updateEmployee(STATE.editingEmpEmail, { name, email, storeId }); STATE.editingEmpEmail = null; }
      else { DB.addEmployee(name, email, storeId); }
      document.getElementById('emp-form-area').classList.add('hidden');
      document.getElementById('input-emp-name').value = '';
      document.getElementById('input-emp-email').value = '';
    });

    document.getElementById('btn-open-camera').addEventListener('click', () => Staff.openCamera());
    document.getElementById('btn-capture-selfie').addEventListener('click', () => Staff.captureSelfie());
    document.getElementById('btn-retake-selfie').addEventListener('click', () => {
      STATE.selfieDataUrl = null;
      document.getElementById('selfie-preview-area').classList.add('hidden');
      const badge = document.getElementById('selfie-badge');
      badge.className = 'badge badge-amber'; badge.textContent = 'Required';
      Staff.openCamera();
    });
    document.getElementById('btn-refresh-location').addEventListener('click', () => Staff.refreshLocation());
    document.getElementById('btn-punch-in').addEventListener('click', () => Staff.showPunchConfirm('IN'));
    document.getElementById('btn-punch-out').addEventListener('click', () => Staff.showPunchConfirm('OUT'));
    document.getElementById('btn-confirm-punch').addEventListener('click', () => Staff.confirmPunch());
    document.getElementById('btn-cancel-punch').addEventListener('click', () => Staff.cancelPunchConfirm());
    document.getElementById('confirm-punch-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) Staff.cancelPunchConfirm(); });
    document.getElementById('btn-close-open-shift').addEventListener('click', () => {
      const openShift = STATE.openShift || Staff.detectOpenShift();
      if (openShift) { Staff.showPunchConfirm('OUT'); }
    });
    document.getElementById('btn-dismiss-reminder').addEventListener('click', () => {
      document.getElementById('reminder-banner').classList.add('hidden');
    });
    document.getElementById('btn-export-csv').addEventListener('click', () => Admin.exportCSV());

    document.addEventListener('click', e => {
      const toggle = e.target.closest('.password-toggle');
      if (toggle) Utils.togglePassword(toggle.dataset.target);
    });

    document.getElementById('reg-password').addEventListener('input', function() {
      const { checks } = Utils.validatePassword(this.value);
      const labels = { min: 'At least 8 characters', upper: 'At least 1 uppercase letter', lower: 'At least 1 lowercase letter', number: 'At least 1 number', special: 'At least 1 special character' };
      document.querySelectorAll('#password-requirements .req').forEach(el => {
        const req = el.dataset.req;
        if (checks[req]) { el.className = 'req met'; el.textContent = '✓ ' + labels[req]; }
        else { el.className = 'req unmet'; el.textContent = '✕ ' + labels[req]; }
      });
    });
    document.getElementById('admin-password-input').addEventListener('input', function() {
      const { checks } = Utils.validatePassword(this.value);
      const labels = { min: 'At least 8 characters', upper: 'At least 1 uppercase letter', lower: 'At least 1 lowercase letter', number: 'At least 1 number', special: 'At least 1 special character' };
      document.querySelectorAll('#admin-pwd-reqs .req').forEach(el => {
        const req = el.dataset.req;
        if (checks[req]) { el.className = 'req met'; el.textContent = '✓ ' + labels[req]; }
        else { el.className = 'req unmet'; el.textContent = '✕ ' + labels[req]; }
      });
    });

    document.getElementById('btn-admin-pwd-submit').addEventListener('click', () => UI.handleAdminPwdSubmit());
    document.getElementById('btn-admin-pwd-cancel').addEventListener('click', () => UI.closeAdminPwdModal());
    // C4: Removed overlay-click dismiss for admin password modal — must use Cancel button
    document.getElementById('admin-password-input').addEventListener('keydown', e => { if (e.key === 'Enter') UI.handleAdminPwdSubmit(); });
    document.getElementById('admin-pwd-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') UI.handleAdminPwdSubmit(); });

    document.getElementById('btn-close-photo').addEventListener('click', () => UI.closePhotoModal());
    document.getElementById('photo-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) UI.closePhotoModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!document.getElementById('photo-overlay').classList.contains('hidden')) UI.closePhotoModal();
        if (!document.getElementById('edit-modal-overlay').classList.contains('hidden')) UI.closeEditModal();
        if (!document.getElementById('report-overlay').classList.contains('hidden')) UI.closeReportPopup();
        if (!document.getElementById('admin-pwd-overlay').classList.contains('hidden')) UI.closeAdminPwdModal();
        if (!document.getElementById('confirm-punch-overlay').classList.contains('hidden')) Staff.cancelPunchConfirm();
      }
    });

    document.getElementById('btn-cancel-edit').addEventListener('click', () => UI.closeEditModal());
    document.getElementById('edit-modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) UI.closeEditModal(); });
    document.getElementById('btn-save-edit').addEventListener('click', () => {
      const id = STATE.editingAttendanceId, newAction = document.getElementById('edit-action-select').value, newTimestamp = document.getElementById('edit-timestamp').value;
      if (id && newAction) DB.updateAttendance(id, newAction, newTimestamp);
    });

    document.getElementById('btn-apply-filter').addEventListener('click', () => UI.applyFilter());
    document.getElementById('btn-clear-filter').addEventListener('click', () => UI.clearFilter());

    document.getElementById('btn-generate-report').addEventListener('click', () => {
      const year = document.getElementById('report-year').value, month = document.getElementById('report-month').value, staffEmail = document.getElementById('report-staff').value;
      if (!year || !month) { Utils.showToast('Select month and year', 'warning'); return; }
      DB.loadMonthlyReport(year, month, staffEmail || null);
    });
    document.getElementById('btn-close-report').addEventListener('click', () => UI.closeReportPopup());
    document.getElementById('report-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) UI.closeReportPopup(); });

    // Calendar navigation
    document.getElementById('btn-cal-prev').addEventListener('click', () => UI.calPrevMonth());
    document.getElementById('btn-cal-next').addEventListener('click', () => UI.calNextMonth());
    document.getElementById('cal-staff-filter').addEventListener('change', () => UI.renderCalendar());

    // Pagination
    document.getElementById('btn-prev-page').addEventListener('click', () => DB.prevPage());
    document.getElementById('btn-next-page').addEventListener('click', () => DB.nextPage());

    // Delegated events for attendance table
    document.getElementById('admin-attendance-body').addEventListener('click', e => {
      const viewBtn = e.target.closest('.view-photo-btn'), editBtn = e.target.closest('.edit-att-btn'), delBtn = e.target.closest('.delete-att-btn'), thumb = e.target.closest('.view-photo');
      if (viewBtn || thumb) { const id = (viewBtn || thumb).dataset.id; UI.showPhotoModal(id); }
      if (editBtn) UI.showEditModal(editBtn.dataset.id);
      if (delBtn) DB.deleteAttendance(delBtn.dataset.id);
    });

    // Edit-in-place: store inline editing
    function activateStoreInlineEdit(item) {
      if (!item) return;
      item.querySelector('.store-name-text').classList.add('hidden');
      item.querySelector('.store-name-input').classList.remove('hidden');
      item.querySelector('.store-lat-text').classList.add('hidden');
      item.querySelector('.store-lat-input').classList.remove('hidden');
      item.querySelector('.store-lng-text').classList.add('hidden');
      item.querySelector('.store-lng-input').classList.remove('hidden');
    }
    document.getElementById('store-list').addEventListener('dblclick', e => {
      const item = e.target.closest('.list-item');
      activateStoreInlineEdit(item);
    });
    // M6: Long-press for mobile inline edit on stores
    let storeLongPressTimer = null;
    document.getElementById('store-list').addEventListener('touchstart', e => {
      const item = e.target.closest('.list-item');
      if (!item) return;
      storeLongPressTimer = setTimeout(() => activateStoreInlineEdit(item), 500);
    }, { passive: true });
    document.getElementById('store-list').addEventListener('touchend', () => { clearTimeout(storeLongPressTimer); }, { passive: true });
    document.getElementById('store-list').addEventListener('touchmove', () => { clearTimeout(storeLongPressTimer); }, { passive: true });
    document.getElementById('store-list').addEventListener('blur', e => {
      const input = e.target.closest('.inline-edit-input');
      if (!input) return;
      // Save on blur handled by keydown listener below
    }, true);
    document.getElementById('store-list').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const input = e.target.closest('.inline-edit-input');
        if (!input) return;
        const item = input.closest('.list-item');
        if (!item) return;
        const id = item.dataset.id;
        const name = item.querySelector('.store-name-input').value.trim();
        const lat = parseFloat(item.querySelector('.store-lat-input').value);
        const lng = parseFloat(item.querySelector('.store-lng-input').value);
        if (name && !isNaN(lat) && !isNaN(lng)) {
          DB.updateStore(id, { name, lat, lng });
        }
        item.querySelector('.store-name-text').textContent = name;
        item.querySelector('.store-name-text').classList.remove('hidden');
        item.querySelector('.store-name-input').classList.add('hidden');
        item.querySelector('.store-lat-text').textContent = lat;
        item.querySelector('.store-lat-text').classList.remove('hidden');
        item.querySelector('.store-lat-input').classList.add('hidden');
        item.querySelector('.store-lng-text').textContent = lng;
        item.querySelector('.store-lng-text').classList.remove('hidden');
        item.querySelector('.store-lng-input').classList.add('hidden');
      }
    });
    document.getElementById('store-list').addEventListener('click', e => {
      const edit = e.target.closest('.edit-store'), del = e.target.closest('.delete-store');
      if (edit) {
        STATE.editingStoreId = edit.dataset.id;
        document.getElementById('input-store-name').value = edit.dataset.name;
        document.getElementById('input-store-lat').value = edit.dataset.lat;
        document.getElementById('input-store-lng').value = edit.dataset.lng;
        document.getElementById('store-form-area').classList.remove('hidden');
      }
      if (del) DB.deleteStore(del.dataset.id);
    });

    // Edit-in-place: employee inline editing
    function activateEmpInlineEdit(item) {
      if (!item) return;
      item.querySelector('.emp-name-text').classList.add('hidden');
      item.querySelector('.emp-name-input').classList.remove('hidden');
      item.querySelector('.emp-store-text').classList.add('hidden');
      item.querySelector('.emp-store-input').classList.remove('hidden');
    }
    document.getElementById('emp-list').addEventListener('dblclick', e => {
      const item = e.target.closest('.list-item');
      activateEmpInlineEdit(item);
    });
    // M6: Long-press for mobile inline edit on employees
    let empLongPressTimer = null;
    document.getElementById('emp-list').addEventListener('touchstart', e => {
      const item = e.target.closest('.list-item');
      if (!item) return;
      empLongPressTimer = setTimeout(() => activateEmpInlineEdit(item), 500);
    }, { passive: true });
    document.getElementById('emp-list').addEventListener('touchend', () => { clearTimeout(empLongPressTimer); }, { passive: true });
    document.getElementById('emp-list').addEventListener('touchmove', () => { clearTimeout(empLongPressTimer); }, { passive: true });
    document.getElementById('emp-list').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const input = e.target.closest('.inline-edit-input');
        if (!input) return;
        const item = input.closest('.list-item');
        if (!item) return;
        const email = item.dataset.email;
        const name = item.querySelector('.emp-name-input').value.trim();
        const storeId = item.querySelector('.emp-store-input').value;
        if (name && storeId) {
          DB.updateEmployee(email, { name, storeId });
        }
        item.querySelector('.emp-name-text').textContent = name;
        item.querySelector('.emp-name-text').classList.remove('hidden');
        item.querySelector('.emp-name-input').classList.add('hidden');
        const storeName = STATE.stores.find(s => s.id === storeId)?.name || '—';
        item.querySelector('.emp-store-text').textContent = storeName;
        item.querySelector('.emp-store-text').classList.remove('hidden');
        item.querySelector('.emp-store-input').classList.add('hidden');
      }
    });
    document.getElementById('emp-list').addEventListener('click', e => {
      const edit = e.target.closest('.edit-emp'), del = e.target.closest('.delete-emp');
      if (edit) {
        STATE.editingEmpEmail = edit.dataset.email;
        document.getElementById('input-emp-name').value = edit.dataset.name;
        document.getElementById('input-emp-email').value = edit.dataset.email;
        UI.populateStoreDropdown();
        document.getElementById('input-emp-store').value = edit.dataset.store;
        document.getElementById('emp-form-area').classList.remove('hidden');
      }
      if (del) DB.deleteEmployee(del.dataset.email);
    });

    window.addEventListener('online', () => Staff.checkOnline());
    window.addEventListener('offline', () => Staff.checkOnline());
  },
  handleAuthSuccess(user) {
    STATE.isOwner = user.email.toLowerCase() === CONFIG.OWNER_EMAIL.toLowerCase();
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('user-area').classList.remove('hidden');
    document.getElementById('user-email').textContent = user.displayName || user.email;
    const roleBadge = document.getElementById('user-role-badge');
    if (STATE.isOwner) { roleBadge.textContent = 'Admin'; roleBadge.style.background = 'rgba(251,191,36,0.2)'; roleBadge.style.color = '#fbbf24'; }
    else { roleBadge.textContent = 'Staff'; roleBadge.style.background = 'rgba(255,255,255,0.15)'; roleBadge.style.color = 'rgba(255,255,255,0.9)'; }
    DB.startListeners();
    if (STATE.isOwner) document.getElementById('btn-switch-admin').classList.remove('hidden');
    UI.showView('employee');
    App.startReminders();
    Utils.showToast(`Welcome, ${user.displayName || user.email}!`, 'success');
  },
  handleLogout() {
    App.stopReminders();
    DB.stopListeners();
    document.getElementById('loading-overlay').classList.add('hidden');
    STATE.firebaseUser = null; STATE.isOwner = false; STATE.employeeRecord = null;
    STATE.stores = []; STATE.employees = []; STATE.attendance = []; STATE.todayAttendance = []; STATE.allAttendanceRaw = [];
    document.getElementById('user-area').classList.add('hidden');
    document.getElementById('employee-view').classList.add('hidden');
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('btn-switch-admin').classList.add('hidden');
    document.getElementById('btn-switch-employee').classList.add('hidden');
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    UI.closeAdminPwdModal();
    Staff.closeCamera();
  }
};

document.addEventListener('DOMContentLoaded', () => { console.log('Geo Attend Pro: loaded'); App.init(); });
