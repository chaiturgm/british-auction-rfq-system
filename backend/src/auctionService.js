const { run, get, all } = require("./db");

const TRIGGERS = {
  BID_RECEIVED: "BID_RECEIVED",
  ANY_RANK_CHANGE: "ANY_RANK_CHANGE",
  L1_RANK_CHANGE: "L1_RANK_CHANGE",
};

function nowIso() {
  return new Date().toISOString();
}

function toDate(value) {
  return new Date(value);
}

function isValidDate(value) {
  return value && !Number.isNaN(new Date(value).getTime());
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getAuctionStatus(rfq, currentDate = new Date()) {
  const start = toDate(rfq.bid_start_time);
  const close = toDate(rfq.bid_close_time);
  const forcedClose = toDate(rfq.forced_bid_close_time);

  if (currentDate > forcedClose) return "Force Closed";
  if (currentDate > close) return "Closed";
  if (currentDate >= start && currentDate <= close) return "Active";
  return "Not Started";
}

function ensurePositiveNumber(value, fieldName) {
  const number = Number(value);
  if (Number.isNaN(number) || number < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return number;
}

function validateCreateRfqPayload(body) {
  const required = [
    "name",
    "reference_id",
    "bid_start_time",
    "bid_close_time",
    "forced_bid_close_time",
    "pickup_service_date",
    "trigger_window_minutes",
    "extension_duration_minutes",
    "extension_trigger_type",
  ];

  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw new Error(`${field} is required`);
    }
  }

  if (!isValidDate(body.bid_start_time)) {
    throw new Error("Bid Start Date & Time must be a valid date");
  }

  if (!isValidDate(body.bid_close_time)) {
    throw new Error("Bid Close Date & Time must be a valid date");
  }

  if (!isValidDate(body.forced_bid_close_time)) {
    throw new Error("Forced Bid Close Date & Time must be a valid date");
  }

  if (!isValidDate(body.pickup_service_date)) {
    throw new Error("Pickup / Service Date must be a valid date");
  }

  const bidStart = toDate(body.bid_start_time);
  const bidClose = toDate(body.bid_close_time);
  const forcedClose = toDate(body.forced_bid_close_time);

  if (bidStart >= bidClose) {
    throw new Error("Bid Start Time must be earlier than Bid Close Time");
  }

  if (forcedClose <= bidClose) {
    throw new Error("Forced Bid Close Time must be greater than Bid Close Time");
  }

  const triggerWindow = Number(body.trigger_window_minutes);
  const extensionDuration = Number(body.extension_duration_minutes);

  if (!Number.isInteger(triggerWindow) || triggerWindow <= 0) {
    throw new Error("Trigger Window X must be a positive integer number of minutes");
  }

  if (!Number.isInteger(extensionDuration) || extensionDuration <= 0) {
    throw new Error("Extension Duration Y must be a positive integer number of minutes");
  }

  if (!Object.values(TRIGGERS).includes(body.extension_trigger_type)) {
    throw new Error("Invalid extension trigger type");
  }
}

function validateBidPayload(body) {
  const required = [
    "carrier_name",
    "freight_charges",
    "origin_charges",
    "destination_charges",
    "transit_time",
    "quote_validity",
  ];

  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw new Error(`${field} is required`);
    }
  }

  const freight = ensurePositiveNumber(body.freight_charges, "Freight charges");
  const origin = ensurePositiveNumber(body.origin_charges, "Origin charges");
  const destination = ensurePositiveNumber(body.destination_charges, "Destination charges");

  return {
    freight,
    origin,
    destination,
    total: freight + origin + destination,
  };
}

async function createActivityLog({
  rfqId,
  type,
  message,
  reason = null,
  oldCloseTime = null,
  newCloseTime = null,
}) {
  await run(
    `
      INSERT INTO activity_logs (
        rfq_id,
        type,
        message,
        reason,
        old_close_time,
        new_close_time,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [rfqId, type, message, reason, oldCloseTime, newCloseTime, nowIso()]
  );
}

async function createRfq(body) {
  validateCreateRfqPayload(body);

  const createdAt = nowIso();

  const result = await run(
    `
      INSERT INTO rfqs (
        name,
        reference_id,
        is_british_auction,
        bid_start_time,
        bid_close_time,
        original_bid_close_time,
        forced_bid_close_time,
        pickup_service_date,
        trigger_window_minutes,
        extension_duration_minutes,
        extension_trigger_type,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      body.name.trim(),
      body.reference_id.trim(),
      body.is_british_auction === false ? 0 : 1,
      toDate(body.bid_start_time).toISOString(),
      toDate(body.bid_close_time).toISOString(),
      toDate(body.bid_close_time).toISOString(),
      toDate(body.forced_bid_close_time).toISOString(),
      toDate(body.pickup_service_date).toISOString(),
      Number(body.trigger_window_minutes),
      Number(body.extension_duration_minutes),
      body.extension_trigger_type,
      createdAt,
    ]
  );

  await createActivityLog({
    rfqId: result.id,
    type: "RFQ_CREATED",
    message: `RFQ ${body.reference_id} created with British Auction configuration.`,
    reason: "RFQ creation",
  });

  return getRfqDetails(result.id);
}

async function getBestSupplierRankings(rfqId) {
  const bids = await all(
    `
      SELECT *
      FROM bids
      WHERE rfq_id = ?
      ORDER BY total_price ASC, created_at ASC, id ASC
    `,
    [rfqId]
  );

  const bestByCarrier = new Map();

  for (const bid of bids) {
    const key = bid.carrier_name.trim().toLowerCase();
    const existing = bestByCarrier.get(key);

    if (
      !existing ||
      bid.total_price < existing.total_price ||
      (bid.total_price === existing.total_price && bid.created_at < existing.created_at)
    ) {
      bestByCarrier.set(key, bid);
    }
  }

  return Array.from(bestByCarrier.values())
    .sort((a, b) => {
      if (a.total_price !== b.total_price) return a.total_price - b.total_price;
      if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
      return a.id - b.id;
    })
    .map((bid, index) => ({
      rank: `L${index + 1}`,
      supplier_rank_number: index + 1,
      carrier_name: bid.carrier_name,
      best_bid_id: bid.id,
      freight_charges: bid.freight_charges,
      origin_charges: bid.origin_charges,
      destination_charges: bid.destination_charges,
      total_price: bid.total_price,
      transit_time: bid.transit_time,
      quote_validity: bid.quote_validity,
      created_at: bid.created_at,
    }));
}

function hasAnyRankChanged(oldRankings, newRankings) {
  const oldMap = new Map(oldRankings.map((r) => [r.carrier_name.toLowerCase(), r.rank]));
  const newMap = new Map(newRankings.map((r) => [r.carrier_name.toLowerCase(), r.rank]));

  if (oldRankings.length !== newRankings.length) return true;

  for (const [carrierName, newRank] of newMap.entries()) {
    if (oldMap.get(carrierName) !== newRank) return true;
  }

  return false;
}

function hasL1Changed(oldRankings, newRankings) {
  const oldL1 = oldRankings[0]?.carrier_name?.toLowerCase() || null;
  const newL1 = newRankings[0]?.carrier_name?.toLowerCase() || null;
  return oldL1 !== newL1;
}

function isInsideTriggerWindow(rfq, currentDate = new Date()) {
  const closeDate = toDate(rfq.bid_close_time);
  const windowStart = addMinutes(closeDate, -Number(rfq.trigger_window_minutes));

  return currentDate >= windowStart && currentDate <= closeDate;
}

function getExtensionDecision({ rfq, oldRankings, newRankings, currentDate }) {
  if (!isInsideTriggerWindow(rfq, currentDate)) {
    return {
      shouldExtend: false,
      reason: "Bid was not submitted inside the trigger window.",
    };
  }

  if (rfq.extension_trigger_type === TRIGGERS.BID_RECEIVED) {
    return {
      shouldExtend: true,
      reason: `Bid received in the last ${rfq.trigger_window_minutes} minutes.`,
    };
  }

  if (rfq.extension_trigger_type === TRIGGERS.ANY_RANK_CHANGE) {
    const changed = hasAnyRankChanged(oldRankings, newRankings);
    return {
      shouldExtend: changed,
      reason: changed
        ? `Supplier ranking changed in the last ${rfq.trigger_window_minutes} minutes.`
        : "No supplier rank change occurred.",
    };
  }

  if (rfq.extension_trigger_type === TRIGGERS.L1_RANK_CHANGE) {
    const changed = hasL1Changed(oldRankings, newRankings);
    return {
      shouldExtend: changed,
      reason: changed
        ? `Lowest bidder / L1 changed in the last ${rfq.trigger_window_minutes} minutes.`
        : "Lowest bidder / L1 did not change.",
    };
  }

  return {
    shouldExtend: false,
    reason: "Unknown trigger type.",
  };
}

async function applyExtensionIfNeeded({ rfq, oldRankings, newRankings, currentDate }) {
  const decision = getExtensionDecision({ rfq, oldRankings, newRankings, currentDate });

  if (!decision.shouldExtend) {
    return { extended: false, reason: decision.reason };
  }

  const oldCloseDate = toDate(rfq.bid_close_time);
  const forcedCloseDate = toDate(rfq.forced_bid_close_time);
  const requestedNewCloseDate = addMinutes(oldCloseDate, Number(rfq.extension_duration_minutes));

  // Hard cap: auction extension can never exceed forced close time.
  const finalNewCloseDate =
    requestedNewCloseDate > forcedCloseDate ? forcedCloseDate : requestedNewCloseDate;

  if (finalNewCloseDate.getTime() === oldCloseDate.getTime()) {
    return {
      extended: false,
      reason: "Auction is already at forced close time and cannot be extended further.",
    };
  }

  await run(
    `
      UPDATE rfqs
      SET bid_close_time = ?
      WHERE id = ?
    `,
    [finalNewCloseDate.toISOString(), rfq.id]
  );

  const cappedMessage =
    requestedNewCloseDate > forcedCloseDate
      ? " Extension was capped at Forced Bid Close Time."
      : "";

  await createActivityLog({
    rfqId: rfq.id,
    type: "TIME_EXTENDED",
    message: `Auction close time extended from ${oldCloseDate.toISOString()} to ${finalNewCloseDate.toISOString()}.${cappedMessage}`,
    reason: decision.reason,
    oldCloseTime: oldCloseDate.toISOString(),
    newCloseTime: finalNewCloseDate.toISOString(),
  });

  return {
    extended: true,
    reason: decision.reason,
    old_close_time: oldCloseDate.toISOString(),
    new_close_time: finalNewCloseDate.toISOString(),
  };
}

async function listRfqs() {
  const rfqs = await all(
    `
      SELECT
        r.*,
        MIN(b.total_price) AS current_lowest_bid
      FROM rfqs r
      LEFT JOIN bids b ON b.rfq_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `
  );

  return rfqs.map((rfq) => ({
    ...rfq,
    is_british_auction: Boolean(rfq.is_british_auction),
    status: getAuctionStatus(rfq),
  }));
}

async function getRfqDetails(id) {
  const rfq = await get(`SELECT * FROM rfqs WHERE id = ?`, [id]);

  if (!rfq) {
    throw new Error("RFQ not found");
  }

  const bids = await all(
    `
      SELECT *
      FROM bids
      WHERE rfq_id = ?
      ORDER BY total_price ASC, created_at ASC, id ASC
    `,
    [id]
  );

  const rankings = await getBestSupplierRankings(id);

  const activityLogs = await all(
    `
      SELECT *
      FROM activity_logs
      WHERE rfq_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [id]
  );

  return {
    rfq: {
      ...rfq,
      is_british_auction: Boolean(rfq.is_british_auction),
      status: getAuctionStatus(rfq),
      current_lowest_bid: rankings[0]?.total_price ?? null,
    },
    bids,
    rankings,
    activity_logs: activityLogs,
  };
}

async function submitBid(rfqId, body) {
  const rfq = await get(`SELECT * FROM rfqs WHERE id = ?`, [rfqId]);

  if (!rfq) {
    throw new Error("RFQ not found");
  }

  if (!rfq.is_british_auction) {
    throw new Error("This RFQ is not configured as a British Auction");
  }

  const currentDate = new Date();
  const start = toDate(rfq.bid_start_time);
  const close = toDate(rfq.bid_close_time);
  const forcedClose = toDate(rfq.forced_bid_close_time);

  if (currentDate < start) {
    throw new Error("Bidding has not started yet");
  }

  if (currentDate > forcedClose) {
    throw new Error("Auction is force closed. Bidding is no longer allowed");
  }

  if (currentDate > close) {
    throw new Error("Auction is closed. Bidding is no longer allowed");
  }

  const price = validateBidPayload(body);
  const oldRankings = await getBestSupplierRankings(rfqId);
  const createdAt = nowIso();

  const insertResult = await run(
    `
      INSERT INTO bids (
        rfq_id,
        carrier_name,
        freight_charges,
        origin_charges,
        destination_charges,
        transit_time,
        quote_validity,
        total_price,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      rfqId,
      body.carrier_name.trim(),
      price.freight,
      price.origin,
      price.destination,
      body.transit_time.trim(),
      body.quote_validity.trim(),
      price.total,
      createdAt,
    ]
  );

  await createActivityLog({
    rfqId,
    type: "BID_SUBMITTED",
    message: `${body.carrier_name.trim()} submitted a bid of ${price.total}.`,
    reason: "Supplier bid submitted",
  });

  const newRankings = await getBestSupplierRankings(rfqId);

  const extension = await applyExtensionIfNeeded({
    rfq,
    oldRankings,
    newRankings,
    currentDate,
  });

  return {
    bid_id: insertResult.id,
    total_price: price.total,
    extension,
    details: await getRfqDetails(rfqId),
  };
}

module.exports = {
  TRIGGERS,
  createRfq,
  listRfqs,
  getRfqDetails,
  submitBid,
};
