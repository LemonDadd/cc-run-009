/* =========================================================
 * SugarLog · 内置食物库（GI 升糖指数 + 每 100g 碳水）
 * 数据来源：中国食物成分表（标准版）+ 国际 GI 数据库常见值
 * GI 分档：低 ≤55（绿） 中 56~69（黄） 高 ≥70（红）
 * 每份 GL = GI × (碳水 g/100g × 份量 g /100) /100
 * ========================================================= */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});

  // carbs 为每 100g 可食部碳水化合物（克）；portion 为常用一份参考量（克）
  var FOOD_SEED = [
    // ---------------- 主食 ----------------
    { id: 'f_rice',      name: '白米饭（蒸）',     cat: '主食', gi: 83, carbs: 25.9, portion: 150 },
    { id: 'f_brownrice', name: '糙米饭',           cat: '主食', gi: 68, carbs: 23.0, portion: 150 },
    { id: 'f_bun',       name: '白馒头',           cat: '主食', gi: 88, carbs: 47.0, portion: 100 },
    { id: 'f_wheatbun',  name: '全麦馒头',         cat: '主食', gi: 70, carbs: 42.0, portion: 100 },
    { id: 'f_noodle',    name: '白面条（煮）',     cat: '主食', gi: 81, carbs: 24.2, portion: 180 },
    { id: 'f_wheatsl',   name: '全麦面条（煮）',   cat: '主食', gi: 50, carbs: 22.0, portion: 180 },
    { id: 'f_bread',     name: '白面包',           cat: '主食', gi: 87, carbs: 50.0, portion: 80 },
    { id: 'f_wbread',    name: '全麦面包',         cat: '主食', gi: 71, carbs: 45.0, portion: 80 },
    { id: 'f_porridge',  name: '大米粥',           cat: '主食', gi: 69, carbs: 9.8,  portion: 250 },
    { id: 'f_oats',      name: '燕麦粥（整片燕麦）', cat: '主食', gi: 55, carbs: 12.0, portion: 250 },
    { id: 'f_millet',    name: '小米粥',           cat: '主食', gi: 60, carbs: 8.4,  portion: 250 },
    { id: 'f_corn',      name: '甜玉米（煮）',     cat: '主食', gi: 55, carbs: 19.9, portion: 150 },
    { id: 'f_potato',    name: '土豆（煮/蒸）',    cat: '主食', gi: 78, carbs: 17.5, portion: 150 },
    { id: 'f_sweetpot',  name: '红薯（煮/蒸）',    cat: '主食', gi: 63, carbs: 20.1, portion: 150 },
    { id: 'f_yam',       name: '山药（煮）',       cat: '主食', gi: 54, carbs: 12.4, portion: 150 },
    { id: 'f_taro',      name: '芋头（蒸）',       cat: '主食', gi: 47, carbs: 18.1, portion: 150 },
    { id: 'f_dumpling',  name: '猪肉水饺',         cat: '主食', gi: 55, carbs: 22.0, portion: 180 },

    // ---------------- 蔬菜 ----------------
    { id: 'f_pumpkin',   name: '南瓜（蒸）',       cat: '蔬菜', gi: 75, carbs: 5.5,  portion: 150 },
    { id: 'f_carrot',    name: '胡萝卜（煮）',     cat: '蔬菜', gi: 39, carbs: 8.8,  portion: 100 },
    { id: 'f_lotusroot', name: '藕（炒）',         cat: '蔬菜', gi: 38, carbs: 11.5, portion: 100 },
    { id: 'f_beans',     name: '四季豆（炒）',     cat: '蔬菜', gi: 30, carbs: 5.4,  portion: 150 },
    { id: 'f_greens',    name: '绿叶蔬菜（炒）',   cat: '蔬菜', gi: 15, carbs: 3.0,  portion: 200 },
    { id: 'f_tomato',    name: '西红柿（生）',     cat: '蔬菜', gi: 15, carbs: 4.0,  portion: 150 },
    { id: 'f_cucumber',  name: '黄瓜（生）',       cat: '蔬菜', gi: 15, carbs: 2.9,  portion: 150 },
    { id: 'f_broccoli',  name: '西兰花（焯/炒）',  cat: '蔬菜', gi: 15, carbs: 4.3,  portion: 150 },

    // ---------------- 豆类 / 蛋奶 / 肉 ----------------
    { id: 'f_tofu',      name: '北豆腐',           cat: '豆蛋奶', gi: 20, carbs: 2.0,  portion: 150 },
    { id: 'f_soymilk',   name: '无糖豆浆',         cat: '豆蛋奶', gi: 23, carbs: 1.1,  portion: 250 },
    { id: 'f_mungbean',  name: '绿豆（煮）',       cat: '豆蛋奶', gi: 27, carbs: 19.0, portion: 100 },
    { id: 'f_redbean',   name: '红小豆（煮）',     cat: '豆蛋奶', gi: 27, carbs: 20.0, portion: 100 },
    { id: 'f_milk',      name: '纯牛奶',           cat: '豆蛋奶', gi: 27, carbs: 5.0,  portion: 250 },
    { id: 'f_yogurt',    name: '无糖酸奶',         cat: '豆蛋奶', gi: 36, carbs: 6.0,  portion: 150 },
    { id: 'f_egg',       name: '鸡蛋',             cat: '豆蛋奶', gi: 0,  carbs: 1.5,  portion: 50 },
    { id: 'f_chicken',   name: '鸡胸肉（熟）',     cat: '肉鱼',   gi: 0,  carbs: 0,    portion: 100 },
    { id: 'f_fish',      name: '鱼肉（清蒸）',     cat: '肉鱼',   gi: 0,  carbs: 0,    portion: 120 },
    { id: 'f_shrimp',    name: '虾（白灼）',       cat: '肉鱼',   gi: 0,  carbs: 0.2,  portion: 100 },
    { id: 'f_pork',      name: '瘦猪肉（炒）',     cat: '肉鱼',   gi: 0,  carbs: 0,    portion: 100 },

    // ---------------- 水果 ----------------
    { id: 'f_apple',     name: '苹果',             cat: '水果', gi: 36, carbs: 13.5, portion: 200 },
    { id: 'f_pear',      name: '梨',               cat: '水果', gi: 36, carbs: 11.0, portion: 200 },
    { id: 'f_orange',    name: '橙子',             cat: '水果', gi: 43, carbs: 11.8, portion: 200 },
    { id: 'f_banana',    name: '香蕉（熟）',       cat: '水果', gi: 52, carbs: 22.0, portion: 120 },
    { id: 'f_grape',     name: '葡萄',             cat: '水果', gi: 43, carbs: 10.3, portion: 150 },
    { id: 'f_wmelon',    name: '西瓜',             cat: '水果', gi: 72, carbs: 5.8,  portion: 250 },
    { id: 'f_kiwi',      name: '猕猴桃',           cat: '水果', gi: 52, carbs: 14.5, portion: 150 },
    { id: 'f_straw',     name: '草莓',             cat: '水果', gi: 40, carbs: 7.7,  portion: 200 },
    { id: 'f_pineapple', name: '菠萝',             cat: '水果', gui: 66, gi: 66, carbs: 10.8, portion: 150 },
    { id: 'f_mango',     name: '芒果',             cat: '水果', gi: 51, carbs: 14.0, portion: 150 },

    // ---------------- 坚果 ----------------
    { id: 'f_peanut',    name: '花生（生）',       cat: '坚果', gi: 14, carbs: 21.7, portion: 30 },
    { id: 'f_walnut',    name: '核桃仁',           cat: '坚果', gi: 15, carbs: 9.6,  portion: 30 },
    { id: 'f_almond',    name: '巴旦木',           cat: '坚果', gi: 15, carbs: 19.7, portion: 30 },

    // ---------------- 糖 / 饮品 / 零食 ----------------
    { id: 'f_sugar',     name: '方糖/白糖',        cat: '糖饮', gi: 65, carbs: 99.9, portion: 15 },
    { id: 'f_honey',     name: '蜂蜜',             cat: '糖饮', gi: 61, carbs: 75.6, portion: 15 },
    { id: 'f_juice',     name: '橙汁（加糖饮料）', cat: '糖饮', gi: 66, carbs: 11.0, portion: 250 },
    { id: 'f_cola',      name: '可乐',             cat: '糖饮', gi: 53, carbs: 10.6, portion: 330 },
    { id: 'f_cookie',    name: '甜饼干',           cat: '糖饮', gi: 70, carbs: 68.0, portion: 50 },
    { id: 'f_cake',      name: '奶油蛋糕',         cat: '糖饮', gi: 75, carbs: 55.0, portion: 80 },
    { id: 'f_choco',     name: '牛奶巧克力',       cat: '糖饮', gi: 45, carbs: 59.0, portion: 40 },
    { id: 'f_icetea',    name: '冰红茶（含糖）',   cat: '糖饮', gi: 55, carbs: 9.0,  portion: 330 }
  ];

  FOOD_SEED.forEach(function (f) {
    delete f.gui;
    f.builtin = true;
  });

  SL.FOOD_SEED = FOOD_SEED;
})(window);
