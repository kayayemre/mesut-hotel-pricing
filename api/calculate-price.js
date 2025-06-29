// /api/calculate-price.js

// Basit session (oturum) için global bir objede saklama (production'da gerçek DB gerekir)
let sessionStore = {};

// Fiyat ve çarpan tablosu (Senin verdiğinle aynı)
const priceDatabase = [
  { start: "2025-06-25", end: "2025-07-10", price: 2500 },
  { start: "2025-07-11", end: "2025-09-19", price: 3175 },
  { start: "2025-09-20", end: "2025-09-30", price: 3780 },
  { start: "2025-10-01", end: "2025-10-15", price: 3180 },
  { start: "2025-10-16", end: "2025-10-31", price: 2255 },
];
const multiplierTable = {
  "1_0": 1.7, "1_1": 1.7, "1_2": 2.0,
  "2_0": 2.0, "2_1": 2.0, "3_0": 2.7
};

// Türkçe sayıları rakama çevir
const turkishNumbers = {
  "bir": 1, "iki": 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6,
  "yedi": 7, "sekiz": 8, "dokuz": 9, "on": 10, "sıfır": 0
};

// Ay isimleri
const months = [
  "ocak","şubat","mart","nisan","mayıs","haziran",
  "temmuz","ağustos","eylül","ekim","kasım","aralık"
];

// Yardımcı: Türkçe sayıları rakama çevir
function parseTurkishNumber(word) {
  if (!word) return null;
  if (!isNaN(word)) return parseInt(word);
  return turkishNumbers[word.toLocaleLowerCase("tr")] || null;
}

// Yardımcı: string'den tarihi yakala
function parseDateFromText(text, today = new Date()) {
  text = text.toLocaleLowerCase("tr");
  let date = null;

  // "14 temmuz", "15 ağustos", "1 ekim" vb.
  let re = /(\d{1,2})[\s\.]*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/;
  let match = text.match(re);
  if (match) {
    let gun = parseInt(match[1]);
    let ay = months.indexOf(match[2]) + 1;
    let yil = today.getFullYear();
    // Eğer ay ve gün bugünden önceyse gelecek yılı kullan
    if (ay < (today.getMonth()+1) || (ay === (today.getMonth()+1) && gun < today.getDate())) yil++;
    date = new Date(`${yil}-${String(ay).padStart(2,"0")}-${String(gun).padStart(2,"0")}`);
    return date;
  }

  // "bu pazartesi", "gelecek cuma", "yarın", "bugün" gibi ifadeler
  if (text.includes("yarın")) {
    date = new Date(today); date.setDate(today.getDate()+1); return date;
  }
  if (text.includes("bugün")) {
    date = new Date(today); return date;
  }
  let daysOfWeek = ["pazar","pazartesi","salı","çarşamba","perşembe","cuma","cumartesi"];
  let foundDow = daysOfWeek.find(d => text.includes(d));
  if (foundDow) {
    let wanted = daysOfWeek.indexOf(foundDow);
    let diff = (wanted - today.getDay() + 7) % 7;
    if (text.includes("gelecek") || text.includes("haftaya")) diff += 7;
    if (diff === 0) diff = 7; // mesela "bu pazartesi" bugündeysen bir hafta sonrasını ver
    date = new Date(today); date.setDate(today.getDate()+diff);
    return date;
  }

  // Sadece rakam ile gün verirlerse, mesela "14'ünde"
  re = /(\d{1,2})[' ]?inde/;
  match = text.match(re);
  if (match) {
    let gun = parseInt(match[1]);
    let ay = today.getMonth()+1;
    let yil = today.getFullYear();
    if (gun < today.getDate()) ay++;
    date = new Date(`${yil}-${String(ay).padStart(2,"0")}-${String(gun).padStart(2,"0")}`);
    return date;
  }

  return null;
}

// Gece ve gün yakalayıcı
function parseNightCount(text) {
  text = text.toLocaleLowerCase("tr");
  // "4 gece", "iki gece", "3 gün" vs.
  let re = /(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)[\s\-]*(gece|gün)/;
  let match = text.match(re);
  if (match) {
    let sayi = parseTurkishNumber(match[1]);
    if (match[2] === "gün" && sayi > 1) sayi = sayi - 1;
    return sayi;
  }
  return null;
}

// Kişi ve çocuk yakalayıcı
function parsePersonChild(text) {
  text = text.toLocaleLowerCase("tr");
  let personCount = null, childCount = null, childAges = [];

  // "3 yetişkin 2 çocuk", "2 büyük 1 küçük", "2+1"
  let re = /(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s*(yetişkin|büyük)/;
  let match = text.match(re);
  if (match) personCount = parseTurkishNumber(match[1]);

  re = /(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s*(çocuk|küçük)/;
  match = text.match(re);
  if (match) childCount = parseTurkishNumber(match[1]);

  // "3+2" gibi format
  re = /(\d+)\s*\+\s*(\d+)/;
  match = text.match(re);
  if (match) { personCount = parseInt(match[1]); childCount = parseInt(match[2]); }

  // "2 kişi", "4 kişi"
  re = /(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s*kişi/;
  match = text.match(re);
  if (match) { personCount = parseTurkishNumber(match[1]); }

  // "Çocuk yaşları: 5 ve 8", "5,8 yaş" gibi
  re = /yaş[ıı]?:?\s*([\d ,ve]+)/;
  match = text.match(re);
  if (match) {
    let yaslar = match[1].replace(/ve/g,",").replace(/\s/g,"").split(",");
    yaslar.forEach(y=>{let a=parseInt(y);if(!isNaN(a))childAges.push(a);});
  }
  // Sadece "5 ve 8" veya "5,8"
  re = /(\d{1,2})\s*[ve,]\s*(\d{1,2})\s*yaş/;
  match = text.match(re);
  if (match) {
    childAges = [parseInt(match[1]), parseInt(match[2])];
  }

  return { personCount, childCount, childAges };
}

// İki tarih arası gece sayısı
function getNightCount(start, end) {
  return Math.round((end - start)/(1000*60*60*24));
}

// Hangi tarihte hangi fiyat?
function getDailyPrice(date) {
  let dateStr = date.toISOString().slice(0,10);
  for (let per of priceDatabase) {
    if (dateStr >= per.start && dateStr <= per.end) return per.price;
  }
  return 0;
}

// Hesaplama mantığı
function calculatePrice(startDate, nightCount, adults, childrenAges) {
  // 13+ yaş çocukları yetişkin olarak say
  let totalAdults = adults;
  let validChildAges = [];
  childrenAges.forEach(yas => {
    if (yas >= 13) totalAdults++;
    else if (yas >= 2) validChildAges.push(yas);
    // 0-1 yaş bebek sayılmaz
  });
  let combinationKey = `${totalAdults}_${validChildAges.length}`;
  if (!multiplierTable[combinationKey]) {
    return { error: "Bu kişi/çocuk kombinasyonuna göre fiyatlandırma yapılamıyor." };
  }
  // Gün gün fiyat topla
  let total = 0;
  let dt = new Date(startDate);
  for (let i=0;i<nightCount;i++) {
    total += getDailyPrice(dt);
    dt.setDate(dt.getDate()+1);
  }
  let finalPrice = Math.round(total * multiplierTable[combinationKey]);
  return {
    nights: nightCount,
    totalAdults,
    totalChildren: validChildAges.length,
    childrenAges,
    price: finalPrice,
    info: `${nightCount} gece, ${totalAdults} yetişkin, ${validChildAges.length} çocuk`
  };
}

// Ana mesaj analizci (tüm bilgileri birleştirir)
function analyzeMessage(raw, session = {}) {
  let text = (raw || "").toLocaleLowerCase("tr");
  // Tarihleri yakala
  let checkin = session.checkin || parseDateFromText(text);
  let nightCount = session.nightCount || parseNightCount(text);
  let personInfo = parsePersonChild(text);
  let adults = session.adults || personInfo.personCount;
  let children = session.children || personInfo.childCount;
  let childrenAges = session.childrenAges || personInfo.childAges || [];

  // "14-19 temmuz" veya "15-20 temmuz" gibi aralık
  let re = /(\d{1,2})[\s\.]*-(\d{1,2})[\s\.]*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/;
  let match = text.match(re);
  if (match) {
    let gun1 = parseInt(match[1]), gun2 = parseInt(match[2]), ay = months.indexOf(match[3])+1, yil = new Date().getFullYear();
    if (ay < (new Date().getMonth()+1)) yil++;
    checkin = new Date(`${yil}-${String(ay).padStart(2,"0")}-${String(gun1).padStart(2,"0")}`);
    let checkout = new Date(`${yil}-${String(ay).padStart(2,"0")}-${String(gun2).padStart(2,"0")}`);
    nightCount = getNightCount(checkin, checkout);
  }

  // "15 temmuz 4 gece" gibi (hem tarih hem gece)
  if (!nightCount) nightCount = session.nightCount;
  if (!adults) adults = session.adults;
  if (!children) children = session.children;
  if (!childrenAges.length && session.childrenAges) childrenAges = session.childrenAges;

  // Dönüş (bulunan ve eksik kalanları açıkça gönder)
  return {
    checkin,
    nightCount,
    adults,
    children,
    childrenAges,
    completed: !!(checkin && nightCount && adults),
    missing: [
      !checkin ? "giriş tarihi" : null,
      !nightCount ? "gece sayısı" : null,
      !adults ? "yetişkin sayısı" : null
    ].filter(Boolean)
  };
}

// API HANDLER
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error:"POST kullanın"});
  // Session yönetimi için (ör: kullanıcı id veya custom bir oturum id'si gönderilebilir)
  let { message, sessionId, context } = req.body;
  if (!sessionId) sessionId = "global"; // Test amaçlı
  if (!sessionStore[sessionId]) sessionStore[sessionId] = {};

  // Son mesaj ve mevcut session birleştirilip analiz edilir
  let analyze = analyzeMessage(message, sessionStore[sessionId]);

  // Session'a yeni bilgileri yaz
  Object.assign(sessionStore[sessionId], analyze);

  if (!analyze.completed) {
    return res.status(200).json({
      completed: false,
      missing: analyze.missing,
      session: sessionStore[sessionId],
      message: `Lütfen eksik bilgileri girin: ${analyze.missing.join(", ")}`
    });
  }

  // Her şey tamamsa fiyatı hesapla
  let hesap = calculatePrice(
    analyze.checkin,
    analyze.nightCount,
    analyze.adults,
    analyze.childrenAges
  );
  if (hesap.error) {
    return res.status(200).json({ completed: true, error: hesap.error });
  }

  // Sessionı temizle (isteğe bağlı)
  //delete sessionStore[sessionId];

  // Yanıt
  res.status(200).json({
    completed: true,
    checkin: analyze.checkin,
    nights: analyze.nightCount,
    adults: hesap.totalAdults,
    children: hesap.totalChildren,
    childrenAges: hesap.childrenAges,
    price: hesap.price,
    info: hesap.info,
    session: sessionStore[sessionId]
  });
}
