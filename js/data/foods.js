/* ============================================================
   data/foods.js — 内置食物升糖指数（GI）库
   数值为常见参考值（中文学界/国际 GI 数据库），用于估算 GL，
   实际因品种、烹饪方式而异。
   carbs = 每 100g 可食部碳水化合物(g)；默认份为一份参考重量
   ============================================================ */
(function (root) {
  'use strict';

  const FOODS = [
    // ---------- 主食 / 谷薯 ----------
    { name: '白米饭（蒸）', category: '主食', gi: 83, carbs: 25.9, defaultPortion: 150, note: '高GI，放凉后抗性淀粉略增' },
    { name: '糙米饭', category: '主食', gi: 68, carbs: 23.0, defaultPortion: 150, note: '含麸皮，纤维更多' },
    { name: '黑米饭', category: '主食', gi: 55, carbs: 25.0, defaultPortion: 150, note: '' },
    { name: '白米粥（大米粥）', category: '主食', gi: 69, carbs: 9.8, defaultPortion: 250, note: '糊化程度高，吸收快，建议搭配蛋白质与蔬菜' },
    { name: '小米粥', category: '主食', gi: 61, carbs: 8.4, defaultPortion: 250, note: '' },
    { name: '燕麦粥（整粒/传统燕麦）', category: '主食', gi: 55, carbs: 12.0, defaultPortion: 250, note: 'β-葡聚糖有助延缓升糖；速溶燕麦GI更高' },
    { name: '白馒头', category: '主食', gi: 88, carbs: 47.0, defaultPortion: 80, note: '发酵面食GI偏高' },
    { name: '全麦馒头', category: '主食', gi: 70, carbs: 45.0, defaultPortion: 80, note: '' },
    { name: '白面包', category: '主食', gi: 87, carbs: 50.0, defaultPortion: 80, note: '' },
    { name: '全麦面包', category: '主食', gi: 71, carbs: 43.0, defaultPortion: 80, note: '选真正全麦粉第一位' },
    { name: '玉米（甜玉米，煮）', category: '主食', gi: 55, carbs: 19.7, defaultPortion: 150, note: '可作主食替代' },
    { name: '白面面条（煮）', category: '主食', gi: 82, carbs: 24.2, defaultPortion: 180, note: '不要煮过烂，al dente 升糖更慢' },
    { name: '全麦面条/荞麦面', category: '主食', gi: 59, carbs: 24.0, defaultPortion: 180, note: '' },
    { name: '红薯（煮/蒸）', category: '主食', gi: 63, carbs: 20.1, defaultPortion: 150, note: '替代部分主食' },
    { name: '土豆（煮）', category: '主食', gi: 78, carbs: 17.2, defaultPortion: 150, note: '当菜吃易超标，应计入主食' },
    { name: '土豆泥', category: '主食', gi: 87, carbs: 16.0, defaultPortion: 150, note: '泥化后GI显著升高' },
    { name: '山药（蒸）', category: '主食', gi: 51, carbs: 12.4, defaultPortion: 150, note: '低GI主食替代' },
    { name: '芋头（蒸）', category: '主食', gi: 48, carbs: 18.1, defaultPortion: 150, note: '' },
    { name: '蒸南瓜', category: '主食', gi: 75, carbs: 5.3, defaultPortion: 150, note: 'GI高但碳水密度低，量影响GL' },
    { name: '莲藕（炒/煮）', category: '主食', gi: 38, carbs: 16.4, defaultPortion: 150, note: '' },
    { name: '米粉/河粉', category: '主食', gi: 83, carbs: 22.0, defaultPortion: 180, note: '' },
    { name: '饺子（猪肉白菜，约6个）', category: '主食', gi: 62, carbs: 26.0, defaultPortion: 150, note: '带馅带菜，优于白米饭单吃' },

    // ---------- 豆制品 / 蛋奶 / 肉 ----------
    { name: '黄豆（煮）', category: '豆蛋奶', gi: 18, carbs: 11.0, defaultPortion: 80, note: '' },
    { name: '豆腐（北豆腐）', category: '豆蛋奶', gi: 22, carbs: 2.6, defaultPortion: 150, note: '优质植物蛋白' },
    { name: '豆浆（无糖）', category: '豆蛋奶', gi: 23, carbs: 1.1, defaultPortion: 300, note: '务必选无糖' },
    { name: '豆腐干', category: '豆蛋奶', gi: 23, carbs: 10.0, defaultPortion: 80, note: '' },
    { name: '鸡蛋', category: '豆蛋奶', gi: 0, carbs: 1.3, defaultPortion: 50, note: '几乎不含碳水，对血糖影响小' },
    { name: '牛奶（全脂/低脂）', category: '豆蛋奶', gi: 28, carbs: 4.8, defaultPortion: 250, note: '乳糖会升糖，计入总量' },
    { name: '无糖酸奶', category: '豆蛋奶', gi: 36, carbs: 4.0, defaultPortion: 150, note: '注意区分风味酸奶（含糖高）' },
    { name: '鸡胸肉', category: '豆蛋奶', gi: 0, carbs: 0, defaultPortion: 100, note: '' },
    { name: '瘦猪肉', category: '豆蛋奶', gi: 0, carbs: 0, defaultPortion: 100, note: '' },
    { name: '瘦牛肉', category: '豆蛋奶', gi: 0, carbs: 0, defaultPortion: 100, note: '' },
    { name: '鱼（清蒸/水煮）', category: '豆蛋奶', gi: 0, carbs: 0, defaultPortion: 120, note: '建议每周2次以上鱼类' },
    { name: '虾', category: '豆蛋奶', gi: 0, carbs: 0, defaultPortion: 100, note: '' },

    // ---------- 蔬菜 ----------
    { name: '西兰花', category: '蔬菜', gi: 15, carbs: 4.3, defaultPortion: 150, note: '' },
    { name: '菠菜', category: '蔬菜', gi: 15, carbs: 2.8, defaultPortion: 150, note: '' },
    { name: '生菜/油麦菜', category: '蔬菜', gi: 10, carbs: 2.0, defaultPortion: 150, note: '' },
    { name: '黄瓜', category: '蔬菜', gi: 15, carbs: 2.9, defaultPortion: 150, note: '可作加餐' },
    { name: '番茄（生）', category: '蔬菜', gi: 30, carbs: 4.0, defaultPortion: 150, note: '' },
    { name: '白菜/娃娃菜', category: '蔬菜', gi: 12, carbs: 2.2, defaultPortion: 150, note: '' },
    { name: '芹菜', category: '蔬菜', gi: 15, carbs: 3.9, defaultPortion: 150, note: '' },
    { name: '胡萝卜（煮）', category: '蔬菜', gi: 39, carbs: 8.8, defaultPortion: 100, note: '油炒适量，不要大量炖煮' },
    { name: '冬瓜', category: '蔬菜', gi: 12, carbs: 2.6, defaultPortion: 200, note: '' },
    { name: '菌菇（香菇/平菇）', category: '蔬菜', gi: 25, carbs: 5.2, defaultPortion: 100, note: '' },
    { name: '木耳（泡发）', category: '蔬菜', gi: 12, carbs: 6.0, defaultPortion: 100, note: '' },
    { name: '茄子（少油烹饪）', category: '蔬菜', gi: 15, carbs: 4.9, defaultPortion: 150, note: '吸油强，注意烹饪油' },

    // ---------- 水果 ----------
    { name: '苹果', category: '水果', gi: 36, carbs: 13.5, defaultPortion: 150, note: '带皮吃、整吃优于榨汁' },
    { name: '梨', category: '水果', gi: 38, carbs: 13.3, defaultPortion: 150, note: '' },
    { name: '橙子', category: '水果', gi: 43, carbs: 11.8, defaultPortion: 150, note: '吃整果，不喝橙汁（GI更高）' },
    { name: '柚子', category: '水果', gi: 25, carbs: 9.5, defaultPortion: 150, note: '服他汀等药物者注意西柚相互作用' },
    { name: '桃', category: '水果', gi: 42, carbs: 12.2, defaultPortion: 150, note: '' },
    { name: '樱桃', category: '水果', gi: 22, carbs: 10.2, defaultPortion: 120, note: '低GI水果' },
    { name: '草莓', category: '水果', gi: 40, carbs: 7.7, defaultPortion: 150, note: '' },
    { name: '葡萄', category: '水果', gi: 53, carbs: 10.3, defaultPortion: 120, note: '控制一次份量' },
    { name: '香蕉', category: '水果', gi: 51, carbs: 22.0, defaultPortion: 120, note: '碳水较高，半根~1根为宜' },
    { name: '猕猴桃', category: '水果', gi: 53, carbs: 14.5, defaultPortion: 120, note: '' },
    { name: '西瓜', category: '水果', gi: 72, carbs: 5.8, defaultPortion: 200, note: '高GI低GL，一次别超1~2瓣' },
    { name: '菠萝', category: '水果', gi: 66, carbs: 10.8, defaultPortion: 120, note: '' },

    // ---------- 坚果 / 零食 / 饮品 ----------
    { name: '混合坚果（原味）', category: '坚果零食', gi: 20, carbs: 20.0, defaultPortion: 20, note: '一小把（约15-20g），注意热量' },
    { name: '花生（煮/原味）', category: '坚果零食', gi: 14, carbs: 16.2, defaultPortion: 30, note: '' },
    { name: '苏打饼干', category: '坚果零食', gi: 72, carbs: 70.0, defaultPortion: 30, note: '' },
    { name: '全麦饼干', category: '坚果零食', gi: 65, carbs: 68.0, defaultPortion: 30, note: '' },
    { name: '黑巧克力（≥70%）', category: '坚果零食', gi: 30, carbs: 45.0, defaultPortion: 20, note: '选低糖款，少量' },
    { name: '可乐（含糖）', category: '坚果零食', gi: 63, carbs: 10.6, defaultPortion: 330, note: '低血糖急救可用，平时避免' },
    { name: '橙汁（市售加糖）', category: '坚果零食', gi: 66, carbs: 11.0, defaultPortion: 250, note: '不建议日常饮用' },
    { name: '白粥配菜包（参考）', category: '坚果零食', gi: 70, carbs: 12.0, defaultPortion: 250, note: '' },
    { name: '蜂蜜', category: '坚果零食', gi: 58, carbs: 82.0, defaultPortion: 15, note: '单糖为主，1汤匙即约12g碳水' }
  ];

  root.BuiltinFoods = FOODS;
})(window);
