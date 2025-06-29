let sessionStore = {};

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

const turkishNumbers = {
  "bir": 1, "iki": 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6,
  "yedi": 7, "sekiz": 8, "dokuz": 9, "on": 10, "sıfır": 0
};
const months = [
  "ocak","şubat","mart","nisan","mayıs","haziran",
  "temmuz","ağustos","eylül","ekim","kasım","aralık"
];

function parseTurkishNumber(word) {
  if (!word) return null;
  if (!isNaN(word)) return parseInt(word);
  return turkishNumbers[word.toLocaleLowerCase("tr")] || null;
}

// Tarih, gece sayısı yakalama fonksiyonları aynı kalabilir

function parseDateFromText(text, today = new Date()) {
  text = text.toLocaleLowerCase("tr");
  let date = null;
  let re = /(\d{1,2})[\s\.]*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/;
  let match = text.match(re);
  if (match) {
    let gun = parseInt(match[1]);
    let ay = months.indexOf(match[2]) + 1;
    let yil = today.getFullYear();
    if (ay < (today.getMonth()+1) || (ay === (today.getMonth()+1) && gun < today.getDate())) yil++;
    date = new Date(`${yil}-${String(ay).padStart(2,"0")}-${String(gun).padStart(2,"0")}`);
    return date;
  }
  if (text.includes("yarın")) { date = new Date(today); date.setDate(today.getDate()+1); return date; }
  if (text.includes("bugün")) { date = new Date(today); return date; }
  let daysOfWeek = ["pazar","pazartesi","salı","çarşamba","perşembe","cuma","cumartesi"];
  let foundDow = daysOfWeek.find(d => text.includes(d));
  if (foundDow) {
    let wanted = daysOfWeek.indexOf(foundDow);
    let diff = (wanted - today.getDay() + 7) % 7;
    if (text.includes("gelecek") || text.includes("haftaya")) diff += 7;
    if (diff === 0) diff = 7;
    date = new Date(today); date.setDate(today.getDate()+diff);
    return date;
  }
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

function parseNightCount(text) {
  text = text.toLocaleLowerCase("tr");
  let re = /(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)[\s\-]*(gece|gün)/;
  let match = text.match(re);
  if (match) {
    let sayi = parseTurkishNumber(match[1]);
    if (match[2] === "gün" && sayi > 1) sayi = sayi - 1;
    return sayi;
  }
  return null;
}

function parsePersonChild(text) {
  text = text.toLocaleLowerCase("tr");
  let personCount = null, childCount = null, childAges = [];

  // Çocuk hiç yoksa
  if (
    text.includes("çocuk yok") ||
    text.includes("çocuksuz") ||
    text.match(/(\b)yok(\b)/)
  ) {
    childCount = 0;
  }

  let re = /(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s*(yetişkin|büyük)/;
  let match = text.match(re);
  if (match) personCount = parseTurkishNumber(match[1]);

  re = /(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s*(çocuk|küçük)/;
  match = text.match(re);
  if (match) childCount = parseTurkishNumber(match[1]);

  re = /(\d+)\s*\+\s*(\d+)/;
  match = text.match(re);
  if (match) { personCount = parseInt(match[1]); childCount = parseInt(match[2]); }

  re = /(\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)\s*kişi/;
  match = text.match(re);
  if (match) { personCount = parseTurkishNumber(match[1]); }

  // Yaşları bul: her türlü "yaş" ve "yaşları" kombinasyonu
  // 1) yaşları: 5 ve 8 / yaşları 5,8 / yaşları 5 ve 8
  let yasRegex = /yaş(?:ları|ı|lar)?[: ]*([\d\s,ve]+)/;
  let yasMatch = text.match(yasRegex);
  if (yasMatch) {
    let yaslar = yasMatch[1].replace(/ve/g,",").replace(/\s/g,"").split(",");
    yaslar.forEach(y => {
      let a = parseInt(y);
      if (!isNaN(a)) childAges.push(a);
    });
  }
  // 2) "5 ve 8 yaş", "5,8 yaş"
  let y2 = text.match(/(\d{1,2})\s*[ve,]\s*(\d{1,2})\s*yaş/);
  if (y2) {
    childAges = [parseInt(y2[1]), parseInt(y2[2])];
  }
  // 3) "1 çocuk 5 yaş", "2 çocuk 4 yaş" (tek tek yaş yakala)
  let allAges = [];
  let matchAll = text.match(/(\d{1,2})\s*yaş/g);
  if (matchAll) {
    allAges = matchAll.map(t => parseInt(t)).filter(Boolean);
    if (allAges.length > 0) childAges = allAges;
  }

  return { personCount, childCount, childAges };
}

function getNightCount(start, end) {
  return Math.round((end - start)/(1000*60*60*24));
}

function getDailyPrice(date) {
  let dateStr = date.toISOString().slice(0,10);
  for (let per of priceDatabase) {
    if (dateStr >= per.start && dateStr <= per.end) return per.price;
  }
  return 0;
}

function formatDateVerbose(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const monthsStr = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran','Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${date.getDate()} ${monthsStr[date.getMonth()]} ${days[date.getDay()]}`;
}

function formatPrice(price) {
  return price.toLocaleString('tr-TR') + ' TL';
}

function calculatePrice(startDate, nightCount, adults, childrenAges) {
  let totalAdults = adults;
  let validChildAges = [];
  (childrenAges||[]).forEach(yas => {
    if (yas >= 13) totalAdults++;
    else if (yas >= 2) validChildAges.push(yas);
  });
  let combinationKey = `${totalAdults}_${validChildAges.length}`;
  if (!multiplierTable[combinationKey]) {
    return { error: "Bu kişi/çocuk kombinasyonuna göre fiyatlandırma yapılamıyor." };
  }
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
    childrenAges: validChildAges,
    price: finalPrice,
    formattedPrice: formatPrice(finalPrice),
    info: `${nightCount} Gece ${nightCount+1} Gün ${totalAdults} Yetişkin${validChildAges.length > 0 ? ` + ${validChildAges.length} Çocuk (${validChildAges.join(", ")} Yaş)` : ""}`
  };
}

// 🔥 EN KRİTİK FONKSİYON (Çok satırlı / her türlü mesajı yakalar)
function analyzeMessage(raw, session = {}) {
  let text = (raw || "").toLocaleLowerCase("tr");
  // Çok satırlı veya birleşik mesajlar için, satır satır gez
  let lines = text.split("\n").map(x => x.trim()).filter(Boolean);

  let checkin, nightCount, adults, children, childrenAges = [];
  for (let line of lines) {
    let pi = parsePersonChild(line);
    let co = parseDateFromText(line);
    let nc = parseNightCount(line);
    if (co) checkin = co;
    if (typeof pi.personCount === 'number') adults = pi.personCount;
    if (typeof pi.childCount === 'number') children = pi.childCount;
    if (pi.childAges && pi.childAges.length > 0) childrenAges = pi.childAges;
    if (nc) nightCount = nc;
    let re = /(\d{1,2})[\s\.-]*(\d{1,2})[\s\.-]*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/;
    let match = line.match(re);
    if (match) {
      let gun1 = parseInt(match[1]), gun2 = parseInt(match[2]);
      let ay = months.indexOf(match[3])+1;
      let yil = new Date().getFullYear();
      if (ay < (new Date().getMonth()+1)) yil++;
      checkin = new Date(`${yil}-${String(ay).padStart(2,"0")}-${String(gun1).padStart(2,"0")}`);
      let checkout = new Date(`${yil}-${String(ay).padStart(2,"0")}-${String(gun2).padStart(2,"0")}`);
      nightCount = getNightCount(checkin, checkout);
    }
  }
  // Eksik bilgi kontrolü
  let missing = [];
  if (!checkin) missing.push("giriş tarihi");
  if (!nightCount) missing.push("gece sayısı");
  if (!adults) missing.push("yetişkin sayısı");
  if (children > 0 && (!childrenAges || childrenAges.length < children)) missing.push("çocuk yaş(ları)");

  return {
    checkin,
    nightCount,
    adults,
    children,
    childrenAges,
    completed: !(missing.length > 0),
    missing
  };
}

// API handler
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error:"POST kullanın"});
  let { message, sessionId } = req.body;
  if (!sessionId) sessionId = "global";
  if (!sessionStore[sessionId]) sessionStore[sessionId] = {};

  let analyze = analyzeMessage(message, sessionStore[sessionId]);
  Object.assign(sessionStore[sessionId], analyze);

  if (!analyze.completed) {
    return res.status(200).json({
      completed: false,
      missing: analyze.missing.join(", "),
      session: sessionStore[sessionId],
      message: `Lütfen ${analyze.missing.join(", ")} bilgisini de paylaşır mısınız?`
    });
  }

  // Fiyatı hesapla
  let hesap = calculatePrice(
    analyze.checkin,
    analyze.nightCount,
    analyze.adults,
    analyze.childrenAges
  );
  if (hesap.error) {
    return res.status(200).json({ completed: true, error: hesap.error });
  }

  // Çıkış tarihi
  let checkoutDate = new Date(analyze.checkin);
  checkoutDate.setDate(checkoutDate.getDate() + hesap.nights);
  let checkinVerbose = formatDateVerbose(analyze.checkin);
  let checkoutVerbose = formatDateVerbose(checkoutDate);

  res.status(200).json({
    completed: true,
    checkin: checkinVerbose,
    checkout: checkoutVerbose,
    nights: hesap.nights,
    adults: hesap.totalAdults,
    children: hesap.totalChildren,
    childrenAges: hesap.childrenAges,
    price: hesap.price,
    formattedPrice: hesap.formattedPrice,
    info: hesap.info,
    session: sessionStore[sessionId]
  });
}
