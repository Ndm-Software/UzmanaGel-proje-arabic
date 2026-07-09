/**
 * İki koordinat arasındaki mesafeyi kilometre cinsinden hesaplar (Haversine formülü)
 * @param {number} lat1 - Birinci noktanın enlemi
 * @param {number} lon1 - Birinci noktanın boylamı
 * @param {number} lat2 - İkinci noktanın enlemi
 * @param {number} lon2 - İkinci noktanın boylamı
 * @returns {number|null} - Mesafe (km), eğer geçersiz parametre varsa null döner
 */
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  // Parametre kontrolü
  if (
    lat1 === null || lat1 === undefined ||
    lon1 === null || lon1 === undefined ||
    lat2 === null || lat2 === undefined ||
    lon2 === null || lon2 === undefined
  ) {
    return null;
  }

  const lat1Num = Number(lat1);
  const lon1Num = Number(lon1);
  const lat2Num = Number(lat2);
  const lon2Num = Number(lon2);

  if (
    isNaN(lat1Num) || isNaN(lon1Num) ||
    isNaN(lat2Num) || isNaN(lon2Num)
  ) {
    return null;
  }

  const R = 6371; // Dünya yarıçapı (km)
  const dLat = (lat2Num - lat1Num) * Math.PI / 180;
  const dLon = (lon2Num - lon1Num) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Num * Math.PI / 180) * Math.cos(lat2Num * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  // İki ondalık basamağa yuvarla
  return Math.round(distance * 100) / 100;
}

/**
 * Mesafeye göre sıralama yapar
 * @param {Array} items - Mesafe bilgisi içeren öğeler dizisi
 * @param {string} direction - 'asc' veya 'desc'
 * @returns {Array} - Sıralanmış dizi
 */
function sortByDistance(items, direction = 'asc') {
  const sorted = [...items];
  const multiplier = direction === 'asc' ? 1 : -1;
  
  sorted.sort((a, b) => {
    const distA = a.distanceKm !== null && a.distanceKm !== undefined ? a.distanceKm : Infinity;
    const distB = b.distanceKm !== null && b.distanceKm !== undefined ? b.distanceKm : Infinity;
    return (distA - distB) * multiplier;
  });
  
  return sorted;
}

module.exports = {
  getDistanceFromLatLonInKm,
  sortByDistance,
};