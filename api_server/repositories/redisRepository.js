const { redisClient } = require('../config/redisClient');

const GEO_KEY = 'subscriptions_geo';
const META_PREFIX = 'sub_meta:';
const DEFAULT_DISTANCE_KM = 50;

// Member format: "{mobileNumber}||{lat}||{lon}"
const buildMember = (mobileNumber, latitude, longitude) =>
  `${mobileNumber}||${latitude}||${longitude}`;

const parseMobileFromMember = (member) => {
  const parts = (member || '').split('||');
  return parts[0] || null;
};

const parseCoordsFromMember = (member) => {
  const parts = (member || '').split('||');
  if (parts.length < 3) return null;
  return { lat: parseFloat(parts[1]), lon: parseFloat(parts[2]) };
};

/**
 * Haversine great-circle distance between two lat/lon points (km).
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

class RedisRepository {

  /**
   * Add a subscription to the geo index and persist its distance preference.
   */
  async addSubscription(latitude, longitude, mobileNumber, distanceKm = DEFAULT_DISTANCE_KM) {
    const member = buildMember(mobileNumber, latitude, longitude);
    const metaKey = `${META_PREFIX}${member}`;

    console.log(`[RedisRepository] addSubscription: member="${member}" distanceKm=${distanceKm}`);

    await redisClient.geoAdd(GEO_KEY, { longitude, latitude, member });
    await redisClient.hSet(metaKey, {
      distance: String(distanceKm),
      mobileNumber,
      latitude: String(latitude),
      longitude: String(longitude),
    });

    console.log(`[RedisRepository] Subscription added to geo index key="${GEO_KEY}"`);
    return { success: true, member };
  }

  /**
   * Remove a subscription from the geo index and delete its metadata.
   */
  async removeSubscription(latitude, longitude, mobileNumber) {
    const member = buildMember(mobileNumber, latitude, longitude);
    const metaKey = `${META_PREFIX}${member}`;

    console.log(`[RedisRepository] removeSubscription: member="${member}"`);

    await redisClient.zRem(GEO_KEY, member);
    await redisClient.del(metaKey);

    console.log(`[RedisRepository] Subscription removed from geo index`);
    return { success: true };
  }

  /**
   * Find subscriptions whose stored location is within maxRadiusKm of the given point.
   *
   * We intentionally skip WITHDIST / WITHCOORD to avoid the node-redis v5 response-shape
   * discrepancy (those options return an object format that changed across redis client
   * versions). Instead, we get back plain member strings and derive the distance from the
   * lat/lon coordinates encoded directly in the member name.
   *
   * @returns {Promise<Array<{ member: string, distanceKm: number }>>}
   */
  async getNearbySubscriptions(latitude, longitude, maxRadiusKm) {
    console.log(
      `[RedisRepository] getNearbySubscriptions: lat=${latitude} lon=${longitude} maxRadius=${maxRadiusKm}km`
    );

    // Returns string[] — just the member names, no WITHDIST/WITHCOORD
    const members = await redisClient.geoSearch(
      GEO_KEY,
      { longitude, latitude },
      { radius: maxRadiusKm, unit: 'km' },
      { SORT: 'ASC' }
    );

    console.log(`[RedisRepository] geoSearch returned ${members.length} member(s) within ${maxRadiusKm}km`);

    const results = [];
    for (const member of members) {
      const coords = parseCoordsFromMember(member);
      if (!coords) {
        console.warn(`[RedisRepository] Could not parse coords from member="${member}", skipping`);
        continue;
      }
      const distanceKm = haversineDistance(latitude, longitude, coords.lat, coords.lon);
      console.log(`[RedisRepository] member="${member}" distanceKm=${distanceKm.toFixed(3)}`);
      results.push({ member, distanceKm });
    }

    return results;
  }

  /**
   * Retrieve the distance threshold (km) configured for a subscription member.
   */
  async getSubscriptionDistance(member) {
    const metaKey = `${META_PREFIX}${member}`;
    const distStr = await redisClient.hGet(metaKey, 'distance');
    const dist = distStr ? parseFloat(distStr) : DEFAULT_DISTANCE_KM;
    console.log(`[RedisRepository] getSubscriptionDistance member="${member}" → ${dist}km`);
    return dist;
  }

  /**
   * Expose parser so the consumer can extract the mobile number from a member string.
   */
  parseMobileFromMember(member) {
    return parseMobileFromMember(member);
  }

  // ── Legacy methods kept for backward compatibility ───────────────────────

  async putLocation(latitude, longitude, table) {
    const memberId = `${latitude}:${longitude}:${Date.now()}`;
    await redisClient.geoAdd(table, { longitude, latitude, member: memberId });
    console.log(`[RedisRepository] putLocation memberId="${memberId}" table="${table}"`);
    return { success: true, memberId };
  }

  async getSubscriptions(latitude, longitude, kilometers, table) {
    const members = await redisClient.geoSearch(
      table,
      { longitude, latitude },
      { radius: kilometers, unit: 'km' },
      { SORT: 'ASC' }
    );
    return members;
  }
}

module.exports = new RedisRepository();
