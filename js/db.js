/* =========================================================
 * SugarLog · 数据层（IndexedDB 持久化）
 * 仓库：profiles / settings / glucoseRecords / mealRecords
 *       foods / medicationRecords / exerciseRecords
 * 全局命名空间：SL
 * ========================================================= */
(function (global) {
  'use strict';

  var SL = global.SL || (global.SL = {});
  var DB_NAME = 'sugarlog_db';
  var DB_VERSION = 1;
  var dbPromise = null;
  var _db = null;

  var STORES = {
    profiles: { keyPath: 'id' },
    settings: { keyPath: 'id' },
    glucoseRecords: { keyPath: 'id', indexes: [{ name: 'at', keyPath: 'at' }] },
    mealRecords: { keyPath: 'id', indexes: [{ name: 'at', keyPath: 'at' }] },
    foods: { keyPath: 'id' },
    medicationRecords: { keyPath: 'id', indexes: [{ name: 'at', keyPath: 'at' }] },
    exerciseRecords: { keyPath: 'id', indexes: [{ name: 'at', keyPath: 'at' }] }
  };

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        Object.keys(STORES).forEach(function (name) {
          var cfg = STORES[name];
          var store;
          if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: cfg.keyPath });
          } else {
            store = e.target.transaction.objectStore(name);
          }
          (cfg.indexes || []).forEach(function (idx) {
            if (!store.indexNames.contains(idx.name)) {
              store.createIndex(idx.name, idx.keyPath);
            }
          });
        });
      };
      req.onsuccess = function (e) {
        _db = e.target.result;
        _db.onversionchange = function () { _db.close(); };
        resolve(_db);
      };
      req.onerror = function (e) { reject(e.target.error); };
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return openDB().then(function (db) {
      var t = db.transaction(storeName, mode);
      return t.objectStore(storeName);
    });
  }

  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function (e) { resolve(e.target.result); };
      request.onerror = function (e) { reject(e.target.error); };
    });
  }

  var DB = {
    /** 首次启动时初始化：默认 profile / settings / 内置食物库种子 */
    ready: function () {
      return openDB().then(function () { return DB.seed(); });
    },

    seed: function () {
      return Promise.all([
        DB.get('settings', 'default').then(function (s) {
          if (!s) return DB.put('settings', DB.defaultSettings());
          return s;
        }),
        DB.get('profiles', 'me').catch(function () { return null; }).then(function (p) {
          if (!p) return DB.put('profiles', DB.defaultProfile());
          return p;
        }),
        DB.count('foods').then(function (n) {
          if (n === 0) {
            var foods = SL.FOOD_SEED || [];
            return Promise.all(foods.map(function (f) { return DB.put('foods', f); }));
          }
          return null;
        })
      ]);
    },

    get: function (store, id) {
      return tx(store, 'readonly').then(function (s) { return reqToPromise(s.get(id)); });
    },
    put: function (store, obj) {
      return tx(store, 'readwrite').then(function (s) { return reqToPromise(s.put(obj)); });
    },
    delete: function (store, id) {
      return tx(store, 'readwrite').then(function (s) { return reqToPromise(s.delete(id)); });
    },
    count: function (store) {
      return tx(store, 'readonly').then(function (s) { return reqToPromise(s.count()); });
    },
    all: function (store) {
      return tx(store, 'readonly').then(function (s) { return reqToPromise(s.getAll()); });
    },
    /** 按 at 索引取区间（含端点），结果升序 */
    rangeByTime: function (store, fromTs, toTs) {
      return tx(store, 'readonly').then(function (s) {
        var range = IDBKeyRange.bound(fromTs, toTs);
        return reqToPromise(s.index('at').getAll(range));
      });
    },
    /** 清空某个仓库（导出/重置用） */
    clear: function (store) {
      return tx(store, 'readwrite').then(function (s) { return reqToPromise(s.clear()); });
    },
    bulkPut: function (store, list) {
      return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(store, 'readwrite');
          var os = t.objectStore(store);
          list.forEach(function (item) { os.put(item); });
          t.oncomplete = function () { resolve(); };
          t.onerror = function (e) { reject(e.target.error); };
        });
      });
    }
  };

  /* -------------------- 默认数据模型 -------------------- */

  DB.defaultSettings = function () {
    return {
      id: 'default',
      unit: 'mmol',                 // mmol | mgdl
      targetFastingMin: 4.4,
      targetFastingMax: 7.0,
      targetBeforeMin: 4.4,
      targetBeforeMax: 7.0,
      targetAfterMin: 4.4,
      targetAfterMax: 10.0,
      targetBedtimeMin: 4.4,
      targetBedtimeMax: 8.0,
      lowThreshold: 3.9,            // 低血糖阈值
      severeLowThreshold: 3.0,      // 严重低血糖
      highCritical: 16.7,           // 危险高血糖
      remindMedication: true,
      medReminderOffsetMin: 0,
      followupDate: '',             // YYYY-MM-DD
      followupNote: '',
      remindFollowupDays: 3,
      updatedAt: Date.now()
    };
  };

  DB.defaultProfile = function () {
    return {
      id: 'me',
      nickname: '',
      birthday: '',                 // YYYY-MM-DD
      diabetesType: '',             // type1 | type2 | gdm | other
      diagnoseYear: '',
      targetNote: '',
      createdAt: Date.now()
    };
  };

  /** 生成 ID：时间戳 + 随机串 */
  DB.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  };

  SL.DB = DB;
  SL.STORES = STORES;
})(window);
