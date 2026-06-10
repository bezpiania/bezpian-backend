import Resource from '../../models/Resource.js';
import Appointment from '../../models/Appointment.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Returns available slots for a given date and guest count.
 * Each slot includes which resources are available at that time.
 *
 * @param {string} chatbotId
 * @param {string} date - 'YYYY-MM-DD'
 * @param {number} guestCount - number of people (for capacity filtering)
 * @returns {Array} [{ time: '13:00', resources: [{ id, name, capacity }] }]
 */
export async function getAvailableSlotsForDate(chatbotId, date, guestCount = 1) {
  const dayDate = new Date(date + 'T00:00:00.000Z');
  const dayKey = DAY_KEYS[dayDate.getUTCDay()];

  // Load active resources with enough capacity
  const resources = await Resource.find({
    chatbotId,
    isActive: true,
    capacity: { $gte: guestCount },
  });

  if (!resources.length) return [];

  // Load existing appointments for that day
  const dayStart = new Date(date + 'T00:00:00.000Z');
  const dayEnd = new Date(date + 'T23:59:59.999Z');

  const existingAppointments = await Appointment.find({
    chatbotId,
    scheduledAt: { $gte: dayStart, $lte: dayEnd },
    status: { $nin: ['cancelled'] },
  }).select('resourceId scheduledAt durationMinutes');

  // Build a map: resourceId -> Set of booked slot times (HH:MM)
  const bookedSlots = {};
  for (const appt of existingAppointments) {
    if (!appt.resourceId) continue;
    const rid = appt.resourceId.toString();
    if (!bookedSlots[rid]) bookedSlots[rid] = new Set();

    // Mark the slot as booked (considering buffer)
    const startHour = appt.scheduledAt.getUTCHours().toString().padStart(2, '0');
    const startMin = appt.scheduledAt.getUTCMinutes().toString().padStart(2, '0');
    bookedSlots[rid].add(`${startHour}:${startMin}`);
  }

  // Collect all unique slot times across resources for this day
  const slotMap = {}; // time -> [resource]

  for (const resource of resources) {
    const daySchedule = resource.schedule[dayKey];
    if (!daySchedule?.enabled || !daySchedule.slots?.length) continue;

    for (const slot of daySchedule.slots) {
      const time = slot.time;
      const rid = resource._id.toString();
      const isBooked = bookedSlots[rid]?.has(time);
      if (isBooked) continue;

      if (!slotMap[time]) slotMap[time] = [];
      slotMap[time].push({ id: resource._id, name: resource.name, capacity: resource.capacity });
    }
  }

  // Sort slots by time and return
  return Object.entries(slotMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, resources]) => ({ time, resources }));
}

/**
 * Finds the best available resource for a given slot.
 * Picks the resource with smallest sufficient capacity (best fit).
 *
 * @param {string} chatbotId
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} time - 'HH:MM'
 * @param {number} guestCount
 * @returns {Resource|null}
 */
export async function findBestResource(chatbotId, date, time, guestCount = 1, preferredName = null) {
  const slots = await getAvailableSlotsForDate(chatbotId, date, guestCount);
  const slot = slots.find(s => s.time === time);
  if (!slot || !slot.resources.length) return null;

  // If client requested a specific specialist, try to find them first
  if (preferredName) {
    const normalized = preferredName.toLowerCase().trim();
    const preferred = slot.resources.find(r =>
      r.name.toLowerCase().includes(normalized) ||
      normalized.includes(r.name.toLowerCase().split(' ')[0])
    );
    if (preferred) return preferred;
    // Requested specialist not available at this slot — return null so the bot informs the client
    return null;
  }

  // Best fit: smallest capacity that fits the group
  const sorted = slot.resources.sort((a, b) => a.capacity - b.capacity);
  return sorted[0];
}

/**
 * Checks if a specific resource is available at a given date/time.
 */
export async function isResourceAvailable(resourceId, date, time) {
  const existing = await Appointment.findOne({
    resourceId,
    status: { $nin: ['cancelled'] },
    $expr: {
      $and: [
        { $eq: [{ $dateToString: { format: '%Y-%m-%d', date: '$scheduledAt' } }, date] },
        { $eq: [{ $dateToString: { format: '%H:%M', date: '$scheduledAt' } }, time] },
      ],
    },
  });
  return !existing;
}
