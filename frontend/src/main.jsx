import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = "http://localhost:5000/api";

const TRIGGER_LABELS = {
  BID_RECEIVED: "Bid Received in Last X Minutes",
  ANY_RANK_CHANGE: "Any Supplier Rank Change in Last X Minutes",
  L1_RANK_CHANGE: "Lowest Bidder / L1 Rank Change in Last X Minutes",
};

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function money(value) {
  if (value === null || value === undefined) return "No bids yet";
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function App() {
  const [view, setView] = useState("list");
  const [selectedRfqId, setSelectedRfqId] = useState(null);

  function openDetails(id) {
    setSelectedRfqId(id);
    setView("details");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>British Auction RFQ System</h1>
          <p>RFQ creation, supplier bidding, automatic extensions, and forced close rules.</p>
        </div>

        <nav>
          <button onClick={() => setView("list")}>Auction Listing</button>
          <button onClick={() => setView("create")}>Create RFQ</button>
        </nav>
      </header>

      {view === "list" && <AuctionList openDetails={openDetails} />}
      {view === "create" && <CreateRfq onCreated={(id) => openDetails(id)} />}
      {view === "details" && (
        <AuctionDetails rfqId={selectedRfqId} backToList={() => setView("list")} />
      )}
    </div>
  );
}

function AuctionList({ openDetails }) {
  const [rfqs, setRfqs] = useState([]);
  const [error, setError] = useState("");

  async function loadRfqs() {
    try {
      setError("");
      setRfqs(await request("/rfqs"));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadRfqs();
    const timer = setInterval(loadRfqs, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="card">
      <div className="section-title">
        <h2>Auction Listing Page</h2>
        <button onClick={loadRfqs}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>RFQ Name / ID</th>
              <th>Current Lowest Bid</th>
              <th>Current Bid Close Time</th>
              <th>Forced Close Time</th>
              <th>Auction Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rfqs.map((rfq) => (
              <tr key={rfq.id}>
                <td>
                  <strong>{rfq.name}</strong>
                  <br />
                  <span>{rfq.reference_id}</span>
                </td>
                <td>{money(rfq.current_lowest_bid)}</td>
                <td>{formatDate(rfq.bid_close_time)}</td>
                <td>{formatDate(rfq.forced_bid_close_time)}</td>
                <td>
                  <span className={`status ${rfq.status.replace(" ", "-").toLowerCase()}`}>
                    {rfq.status}
                  </span>
                </td>
                <td>
                  <button onClick={() => openDetails(rfq.id)}>View Details</button>
                </td>
              </tr>
            ))}

            {rfqs.length === 0 && (
              <tr>
                <td colSpan="6" className="empty">
                  No RFQs yet. Create one to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreateRfq({ onCreated }) {
  const now = new Date();
  const start = new Date(now.getTime() + 2 * 60 * 1000);
  const close = new Date(now.getTime() + 20 * 60 * 1000);
  const forced = new Date(now.getTime() + 60 * 60 * 1000);
  const pickup = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [form, setForm] = useState({
    name: "",
    reference_id: "",
    is_british_auction: true,
    bid_start_time: toDatetimeLocalValue(start),
    bid_close_time: toDatetimeLocalValue(close),
    forced_bid_close_time: toDatetimeLocalValue(forced),
    pickup_service_date: toDatetimeLocalValue(pickup),
    trigger_window_minutes: 10,
    extension_duration_minutes: 5,
    extension_trigger_type: "BID_RECEIVED",
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const data = await request("/rfqs", {
        method: "POST",
        body: JSON.stringify(form),
      });

      onCreated(data.rfq.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card narrow">
      <h2>Create RFQ with British Auction</h2>

      {error && <p className="error">{error}</p>}

      <form onSubmit={submit} className="form-grid">
        <label>
          RFQ Name
          <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </label>

        <label>
          RFQ Reference ID
          <input
            value={form.reference_id}
            onChange={(e) => update("reference_id", e.target.value)}
            placeholder="RFQ-1001"
            required
          />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.is_british_auction}
            onChange={(e) => update("is_british_auction", e.target.checked)}
          />
          British Auction Enabled
        </label>

        <label>
          Bid Start Date & Time
          <input
            type="datetime-local"
            value={form.bid_start_time}
            onChange={(e) => update("bid_start_time", e.target.value)}
            required
          />
        </label>

        <label>
          Bid Close Date & Time
          <input
            type="datetime-local"
            value={form.bid_close_time}
            onChange={(e) => update("bid_close_time", e.target.value)}
            required
          />
        </label>

        <label>
          Forced Bid Close Date & Time
          <input
            type="datetime-local"
            value={form.forced_bid_close_time}
            onChange={(e) => update("forced_bid_close_time", e.target.value)}
            required
          />
        </label>

        <label>
          Pickup / Service Date
          <input
            type="datetime-local"
            value={form.pickup_service_date}
            onChange={(e) => update("pickup_service_date", e.target.value)}
            required
          />
        </label>

        <label>
          Trigger Window X Minutes
          <input
            type="number"
            min="1"
            value={form.trigger_window_minutes}
            onChange={(e) => update("trigger_window_minutes", Number(e.target.value))}
            required
          />
        </label>

        <label>
          Extension Duration Y Minutes
          <input
            type="number"
            min="1"
            value={form.extension_duration_minutes}
            onChange={(e) => update("extension_duration_minutes", Number(e.target.value))}
            required
          />
        </label>

        <label>
          Extension Trigger Type
          <select
            value={form.extension_trigger_type}
            onChange={(e) => update("extension_trigger_type", e.target.value)}
          >
            {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <button disabled={saving}>{saving ? "Creating..." : "Create RFQ"}</button>
      </form>
    </section>
  );
}

function AuctionDetails({ rfqId, backToList }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function loadDetails() {
    try {
      setError("");
      setData(await request(`/rfqs/${rfqId}`));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadDetails();
    const timer = setInterval(loadDetails, 10000);
    return () => clearInterval(timer);
  }, [rfqId]);

  if (error) {
    return (
      <section className="card">
        <button onClick={backToList}>Back</button>
        <p className="error">{error}</p>
      </section>
    );
  }

  if (!data) {
    return <section className="card">Loading...</section>;
  }

  const { rfq, bids, rankings, activity_logs } = data;

  return (
    <main className="details">
      <section className="card">
        <div className="section-title">
          <div>
            <h2>{rfq.name}</h2>
            <p>{rfq.reference_id}</p>
          </div>
          <button onClick={backToList}>Back to Listing</button>
        </div>

        <div className="summary-grid">
          <Info label="Current Lowest Bid" value={money(rfq.current_lowest_bid)} />
          <Info label="Status" value={rfq.status} />
          <Info label="Current Bid Close Time" value={formatDate(rfq.bid_close_time)} />
          <Info label="Forced Close Time" value={formatDate(rfq.forced_bid_close_time)} />
          <Info label="Pickup / Service Date" value={formatDate(rfq.pickup_service_date)} />
          <Info label="Trigger Window X" value={`${rfq.trigger_window_minutes} minutes`} />
          <Info label="Extension Duration Y" value={`${rfq.extension_duration_minutes} minutes`} />
          <Info
            label="Extension Trigger"
            value={TRIGGER_LABELS[rfq.extension_trigger_type]}
          />
        </div>
      </section>

      <SubmitBid rfq={rfq} onBidSubmitted={loadDetails} />

      <section className="card">
        <h2>Supplier Ranking</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Carrier</th>
                <th>Total Price</th>
                <th>Freight</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Transit Time</th>
                <th>Quote Validity</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((row) => (
                <tr key={row.best_bid_id}>
                  <td>
                    <strong>{row.rank}</strong>
                  </td>
                  <td>{row.carrier_name}</td>
                  <td>{money(row.total_price)}</td>
                  <td>{money(row.freight_charges)}</td>
                  <td>{money(row.origin_charges)}</td>
                  <td>{money(row.destination_charges)}</td>
                  <td>{row.transit_time}</td>
                  <td>{row.quote_validity}</td>
                </tr>
              ))}
              {rankings.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty">
                    No bids yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>All Supplier Bids Sorted by Price</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Carrier</th>
                <th>Total Price</th>
                <th>Freight</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Transit Time</th>
                <th>Quote Validity</th>
                <th>Submitted At</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((bid) => (
                <tr key={bid.id}>
                  <td>{bid.carrier_name}</td>
                  <td>{money(bid.total_price)}</td>
                  <td>{money(bid.freight_charges)}</td>
                  <td>{money(bid.origin_charges)}</td>
                  <td>{money(bid.destination_charges)}</td>
                  <td>{bid.transit_time}</td>
                  <td>{bid.quote_validity}</td>
                  <td>{formatDate(bid.created_at)}</td>
                </tr>
              ))}
              {bids.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty">
                    No bids submitted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Activity Log</h2>
        <div className="activity-list">
          {activity_logs.map((log) => (
            <div key={log.id} className="activity">
              <strong>{log.type}</strong>
              <p>{log.message}</p>
              {log.reason && <small>Reason: {log.reason}</small>}
              {log.old_close_time && (
                <small>
                  Close Time: {formatDate(log.old_close_time)} →{" "}
                  {formatDate(log.new_close_time)}
                </small>
              )}
              <small>{formatDate(log.created_at)}</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SubmitBid({ rfq, onBidSubmitted }) {
  const [form, setForm] = useState({
    carrier_name: "",
    freight_charges: "",
    origin_charges: "",
    destination_charges: "",
    transit_time: "",
    quote_validity: "",
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const total = useMemo(() => {
    const freight = Number(form.freight_charges) || 0;
    const origin = Number(form.origin_charges) || 0;
    const destination = Number(form.destination_charges) || 0;
    return freight + origin + destination;
  }, [form]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      const result = await request(`/rfqs/${rfq.id}/bids`, {
        method: "POST",
        body: JSON.stringify(form),
      });

      setMessage(
        result.extension.extended
          ? `Bid submitted. Auction extended: ${result.extension.reason}`
          : `Bid submitted. ${result.extension.reason}`
      );

      setForm({
        carrier_name: "",
        freight_charges: "",
        origin_charges: "",
        destination_charges: "",
        transit_time: "",
        quote_validity: "",
      });

      onBidSubmitted();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <h2>Submit Supplier Quote / Bid</h2>

      {rfq.status !== "Active" && (
        <p className="warning">
          Auction status is {rfq.status}. Bid submission is allowed only when status is Active.
        </p>
      )}

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <form onSubmit={submit} className="bid-grid">
        <input
          placeholder="Carrier Name"
          value={form.carrier_name}
          onChange={(e) => update("carrier_name", e.target.value)}
          required
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Freight Charges"
          value={form.freight_charges}
          onChange={(e) => update("freight_charges", e.target.value)}
          required
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Origin Charges"
          value={form.origin_charges}
          onChange={(e) => update("origin_charges", e.target.value)}
          required
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Destination Charges"
          value={form.destination_charges}
          onChange={(e) => update("destination_charges", e.target.value)}
          required
        />
        <input
          placeholder="Transit Time e.g. 3 days"
          value={form.transit_time}
          onChange={(e) => update("transit_time", e.target.value)}
          required
        />
        <input
          placeholder="Validity of Quote e.g. 7 days"
          value={form.quote_validity}
          onChange={(e) => update("quote_validity", e.target.value)}
          required
        />
        <div className="computed-total">Total: {money(total)}</div>
        <button disabled={rfq.status !== "Active"}>Submit Bid</button>
      </form>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
