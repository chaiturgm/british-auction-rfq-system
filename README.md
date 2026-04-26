# British Auction RFQ System

A simplified RFQ system that supports British Auction-style bidding with automatic extensions, forced close rules, configurable auction behavior, auction listing/details pages, activity logs, backend APIs, frontend UI, database schema, and HLD.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite

## How to Run

### Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on:

```txt
http://localhost:5000
```

### Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```txt
http://localhost:5173
```

## HLD / Architecture

The following diagram shows the high-level architecture of the British Auction RFQ System.

![High Level Design - British Auction RFQ System](docs/hld-architecture.png)

## Database Schema

### rfqs

| Column | Purpose |
|---|---|
| id | Primary key |
| name | RFQ name |
| reference_id | RFQ reference ID |
| is_british_auction | Whether British Auction is enabled |
| bid_start_time | Bid start date and time |
| bid_close_time | Current bid close date and time. This can be extended. |
| original_bid_close_time | Original bid close date and time |
| forced_bid_close_time | Absolute forced close date and time |
| pickup_service_date | Pickup / service date |
| trigger_window_minutes | X minutes |
| extension_duration_minutes | Y minutes |
| extension_trigger_type | BID_RECEIVED, ANY_RANK_CHANGE, L1_RANK_CHANGE |
| created_at | Creation timestamp |

### bids

| Column | Purpose |
|---|---|
| id | Primary key |
| rfq_id | Linked RFQ |
| carrier_name | Supplier / carrier name |
| freight_charges | Freight charges |
| origin_charges | Origin charges |
| destination_charges | Destination charges |
| transit_time | Transit time |
| quote_validity | Validity of quote |
| total_price | freight + origin + destination |
| created_at | Bid timestamp |

### activity_logs

| Column | Purpose |
|---|---|
| id | Primary key |
| rfq_id | Linked RFQ |
| type | RFQ_CREATED, BID_SUBMITTED, TIME_EXTENDED |
| message | Human-readable message |
| reason | Reason for extension/action |
| old_close_time | Old close time for extension |
| new_close_time | New close time for extension |
| created_at | Log timestamp |

## Backend API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/rfqs` | Create RFQ |
| GET | `/api/rfqs` | List all RFQs |
| GET | `/api/rfqs/:id` | Get RFQ details |
| POST | `/api/rfqs/:id/bids` | Submit supplier bid |

## Core Features

### RFQ Creation

Users can create an RFQ with British Auction enabled.

RFQ creation includes:

- RFQ Name
- Reference ID
- Bid Start Date & Time
- Bid Close Date & Time
- Forced Bid Close Date & Time
- Pickup / Service Date
- Trigger Window X Minutes
- Extension Duration Y Minutes
- Extension Trigger Type

### Quote / Bid Submission

Suppliers can submit quotes with:

- Carrier Name
- Freight Charges
- Origin Charges
- Destination Charges
- Transit Time
- Validity of Quote

The total bid price is calculated as:

```txt
Total Price = Freight Charges + Origin Charges + Destination Charges
```

## British Auction Rules Implemented

1. RFQ can be created with British Auction enabled.
2. RFQ creation includes all required auction fields.
3. Forced Bid Close Time must be greater than Bid Close Time.
4. Bid Start Time must be earlier than Bid Close Time.
5. Bids are blocked before Bid Start Time.
6. Bids are blocked after current Bid Close Time.
7. Bids are blocked after Forced Bid Close Time.
8. Auction extensions never exceed Forced Bid Close Time.
9. Trigger Window X is implemented.
10. Extension Duration Y is implemented.
11. All three trigger types are implemented:
   - Bid received in last X minutes
   - Any supplier rank change in last X minutes
   - Lowest bidder / L1 rank change in last X minutes

## Auction Listing Page

The auction listing page displays:

- RFQ Name / ID
- Current Lowest Bid
- Current Bid Close Time
- Forced Close Time
- Auction Status

Auction status can be:

- Not Started
- Active
- Closed
- Force Closed

## Auction Details Page

The auction details page displays:

- RFQ details
- Current lowest bid
- Current bid close time
- Forced close time
- Auction configuration
- All supplier bids sorted by price
- Supplier ranking as L1, L2, L3, etc.
- Activity log

## Activity Log

The activity log records:

- RFQ creation
- Bid submissions
- Time extensions
- Reason for each extension
- Old close time
- New close time

## Validation Rules Implemented

- Forced Bid Close Time must be greater than Bid Close Time.
- Bid Start Time must be earlier than Bid Close Time.
- Bids cannot be submitted before Bid Start Time.
- Bids cannot be submitted after current Bid Close Time.
- Bids cannot be submitted after Forced Bid Close Time.
- Auction extensions are capped at Forced Bid Close Time.
- Supplier rankings are recalculated after every bid.

## Ranking Assumption

A supplier may submit multiple bids.

For supplier ranking, each supplier is ranked by their best current bid, meaning their lowest submitted total price.

Ties are broken by earlier bid time.

The details page still shows all individual bids sorted by total price.

## Project Structure

```txt
british-auction-rfq-system/
├── backend/
│   ├── package.json
│   └── src/
│       ├── auctionService.js
│       ├── db.js
│       └── server.js
├── frontend/
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       └── styles.css
├── docs/
│   └── hld-architecture.png
└── README.md
```

## Notes

This project is built as a simplified assignment/demo implementation. It focuses on correctness of British Auction rules, RFQ creation, bidding flow, ranking, extension logic, forced close validation, and clear visibility of auction progress.
