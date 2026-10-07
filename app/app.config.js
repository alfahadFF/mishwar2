// يضيف ملف Firebase تلقائياً لما يكون موجود (google-services.json بجذر المشروع)
const fs = require('fs');
const path = require('path');
module.exports = ({ config }) => {
  if (fs.existsSync(path.join(__dirname, 'google-services.json'))) {
    config.android = { ...config.android, googleServicesFile: './google-services.json' };
  }

  // مفتاح OpenRouteService يُقرأ من متغير بيئة ولا يُكتب في المصدر؛ سيُضمّن ضمن إعداد التطبيق عند البناء، لذلك استخدم مفتاحاً محدود الحصة.
  const orsApiKey = process.env.EXPO_PUBLIC_ORS_API_KEY || process.env.ORS_API_KEY;
  if (orsApiKey) {
    config.extra = { ...config.extra, orsApiKey };
  }

  return config;
};
