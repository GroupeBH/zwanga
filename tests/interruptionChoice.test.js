const test = require("node:test");
const assert = require("node:assert/strict");
const { loader } = require("./helpers/loadTypeScript.cjs");
const { getPassengerInterruptionChoice, isMatchingInterruptionQuote } =
  loader()("features/trip/interruptionChoice.ts");
const booking = () => ({
  id: "booking",
  tripId: "trip",
  passengerId: "passenger",
  status: "accepted",
  pickedUp: true,
  tripInterruptionRequest: {
    id: "request",
    status: "confirmed",
    confirmations: [
      { bookingId: "booking", passengerId: "passenger", status: "confirmed" },
    ],
  },
});

test("offers a choice only to a confirmed onboard passenger", () => {
  const b = booking();
  assert.deepEqual(getPassengerInterruptionChoice(b, "passenger"), {
    tripId: "trip",
    requestId: "request",
    bookingId: "booking",
  });
  assert.equal(getPassengerInterruptionChoice(b, "stranger"), null);
  assert.equal(
    getPassengerInterruptionChoice({ ...b, pickedUp: false }, "passenger"),
    null,
  );
  b.tripInterruptionRequest.status = "pending";
  assert.equal(getPassengerInterruptionChoice(b, "passenger"), null);
});
test("does not prompt again after waiting, stopping or resuming", () => {
  const b = booking();
  b.tripInterruptionRequest.confirmations[0].decision = "wait";
  assert.equal(getPassengerInterruptionChoice(b, "passenger"), null);
  assert.ok(getPassengerInterruptionChoice(b, "passenger", true));
  b.tripInterruptionRequest.confirmations[0].decision = "stop";
  assert.equal(getPassengerInterruptionChoice(b, "passenger", true), null);
  b.tripInterruptionRequest.status = "completed";
  assert.equal(getPassengerInterruptionChoice(b, "passenger"), null);
});
test("ignores completed bookings and confirmations belonging to another reservation", () => {
  const b = booking();
  assert.equal(
    getPassengerInterruptionChoice({ ...b, status: "completed" }, "passenger"),
    null,
  );
  b.tripInterruptionRequest.confirmations[0].bookingId = "another";
  assert.equal(getPassengerInterruptionChoice(b, "passenger"), null);
});
test("never accepts a stale quote or an amount exceeding the original price", () => {
  const q = {
    id: "quote",
    bookingId: "booking",
    requestId: "request",
    passengerAmount: 1500,
    originalPassengerAmount: 10000,
    currency: "CDF",
    travelledPercentage: 20,
  };
  assert.equal(isMatchingInterruptionQuote(q, "booking", "request"), true);
  assert.equal(isMatchingInterruptionQuote(q, "booking", "old-request"), false);
  assert.equal(
    isMatchingInterruptionQuote(
      { ...q, passengerAmount: 10001 },
      "booking",
      "request",
    ),
    false,
  );
  assert.equal(
    isMatchingInterruptionQuote(
      { ...q, passengerAmount: NaN },
      "booking",
      "request",
    ),
    false,
  );
});
