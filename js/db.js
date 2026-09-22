/* ============================================================
   db.js — IndexedDB 持久化层
   stores: profile(kv) / settings(kv) / glucose / meals / foods
           medication / exercise / reminders
   ============================================================ */
(function (root) {
  'use strict';

  const DB_NAME = 'sugarlog';
  const DB_VERSION = 1;

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const stores = {
          glucose: { keyPath: 'id', indexes: [['at', 'at']] },
          meals: { keyPath: 'id', indexes: [['at', 'at'], ['meal', 'meal']] },
          foods: { keyPath: 'id', indexes: [['name', 'name'], ['builtin', 'builtin']] },
          medication: { keyPath: 'id', indexes: [['at', 'at'], ['name', 'name']] },
          exercise: { keyPath: 'id', indexes: [['at', 'at']] },
          reminders: { keyPath: 'id', indexes: [['enabled', 'enabled']] },
          kv: { keyPath: 'key' }
        };
        Object.entries(stores).forEach(([name, cfg]) => {
          let store;
          if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: cfg.keyPath });
          } else {
            store = e.target.transaction.objectStore(name);
          }
          (cfg.indexes || []).forEach(([idxName, keyPath]) => {
            if (store && !store.indexNames.contains(idxName)) store.createIndex(idxName, keyPath);
          });
        });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeName, mode) {
    return open().then(db => db.transaction(storeName, mode).objectStore(storeName));
  }

  function reqAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  // ---------- 通用 CRUD ----------
  async function put(store, obj) {
    const s = await tx(store, 'readwrite');
    await reqAsPromise(s.put(obj));
    return obj;
  }
  async function get(store, id) {
    const s = await tx(store, 'readonly');
    return reqAsPromise(s.get(id));
  }
  async function del(store, id) {
    const s = await tx(store, 'readwrite');
    await reqAsPromise(s.delete(id));
  }
  async function all(store) {
    const s = await tx(store, 'readonly');
    return reqAsPromise(s.getAll());
  }
  async function clear(store) {
    const s = await tx(store, 'readwrite');
    await reqAsPromise(s.clear());
  }
  // 按索引取区间（时间戳范围）
  async function rangeByIndex(store, indexName, from, to) {
    const s = await tx(store, 'readonly');
    const range = IDBKeyRange.bound(from, to);
    return reqAsPromise(s.index(indexName).getAll(range));
  }

  // ---------- KV（profile / settings） ----------
  async function getKV(key, fallback) {
    const row = await get('kv', key);
    return row ? row.value : fallback;
  }
  async function setKV(key, value) {
    await put('kv', { key, value });
    return value;
  }

  const Profile = {
    async get() {
      return getKV('profile', {
        name: '', birthday: '', diabetesType: 'type2',
        diagnosisYear: '', targetNote: ''
      });
    },
    save(p) { return setKV('profile', p); }
  };

  const SETTINGS_DEFAULTS = {
    unit: 'mmol/L',
    targets: {
      fasting: { low: 4.4, high: 7.0 },
      before_meal: { low: 4.4, high: 7.0 },
      after_meal: { low: 4.4, high: 10.0 },
      bedtime: { low: 4.4, high: 10.0 },
      night: { low: 4.4, high: 9.0 },
      random: { low: 4.4, high: 10.0 }
    },
    hypoThreshold: 3.9,
    dangerHigh: 16.7,
    reminders: { glucose: true, medication: true, followup: true },
    medicationListNote: ''
  };

  const Settings = {
    async get() {
      const s = await getKV('settings', null);
      if (!s) return JSON.parse(JSON.stringify(SETTINGS_DEFAULTS));
      // 合并默认值，升级时新字段不丢失
      return Object.assign(JSON.parse(JSON.stringify(SETTINGS_DEFAULTS)), s, {
        targets: Object.assign({}, SETTINGS_DEFAULTS.targets, s.targets || {}),
        reminders: Object.assign({}, SETTINGS_DEFAULTS.reminders, (s.reminders || {}))
      });
    },
    save(s) { return setKV('settings', s); }
  };

  // ---------- 各记录表便捷方法 ----------
  function repo(store, prefix) {
    return {
      all: () => all(store),
      get: (id) => get(store, id),
      save: async (obj) => {
        if (!obj.id) obj.id = uid(prefix);
        if (!obj.createdAt) obj.createdAt = Date.now();
        obj.updatedAt = Date.now();
        return put(store, obj);
      },
      remove: (id) => del(store, id),
      between: (fromTs, toTs) => rangeByIndex(store, 'at', fromTs, toTs),
      bulkPut: async (arr) => {
        const db = await open();
        const t = db.transaction(store, 'readwrite');
        arr.forEach(o => t.objectStore(store).put(o));
        return new Promise((resolve, reject) => {
          t.oncomplete = resolve;
          t.onerror = () => reject(t.error);
        });
      }
    };
  }

  const Glucose = repo('glucose', 'gl');
  const Meals = repo('meals', 'ml');
  const Foods = repo('foods', 'fd');
  const Medication = repo('medication', 'md');
  const Exercise = repo('exercise', 'ex');
  const Reminders = repo('reminders', 'rm');

  // 首次启动写入内置食物库
  async function seedFoods(builtinList) {
    const existing = await all('foods');
    if (existing.length) return;
    const now = Date.now();
    await Foods.bulkPut(builtinList.map((f, i) => Object.assign({
      id: 'builtin_' + i, builtin: true, createdAt: now
    }, f)));
  }

  // 全部数据导出 / 导入
  async function exportAll() {
    const [profile, settings, glucose, meals, foods, medication, exercise, reminders] =
      await Promise.all([
        getKV('profile', null), getKV('settings', null),
        all('glucose'), all('meals'), all('foods'),
        all('medication'), all('exercise'), all('reminders')
      ]);
    return {
      app: 'SugarLog', version: 1, exportedAt: new Date().toISOString(),
      data: { profile, settings, glucose, meals, foods, medication, exercise, reminders }
    };
  }

  async function importAll(payload, mode) {
    // mode: 'merge' 合并（默认）| 'replace' 覆盖
    const d = (payload && payload.data) || payload;
    if (!d || typeof d !== 'object') throw new Error('备份文件格式不正确');

    const imp = async (store, arr, key) => {
      if (!Array.isArray(arr)) return;
      if (mode === 'replace') await clear(store);
      const db = await open();
      const t = db.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      arr.forEach(o => {
        if (o && (o[key || 'id'] != null)) os.put(o);
      });
      return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    };

    if (d.profile) await setKV('profile', d.profile);
    if (d.settings) await setKV('settings', d.settings);
    await imp('glucose', d.glucose);
    await imp('meals', d.meals);
    await imp('foods', d.foods);
    await imp('medication', d.medication);
    await imp('exercise', d.exercise);
    await imp('reminders', d.reminders);
  }

  root.DB = {
    open, uid,
    Profile, Settings,
    Glucose, Meals, Foods, Medication, Exercise, Reminders,
    seedFoods, exportAll, importAll, SETTINGS_DEFAULTS
  };
})(window);
