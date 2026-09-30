import os
import subprocess
import shutil
import tempfile

html_content = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Trez Marias Catering Services - System Capabilities & Requirements Specification</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  @page {
    size: letter portrait;
    margin: 15mm 14mm 15mm 14mm;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1e293b;
    background-color: #ffffff;
    font-size: 8.5pt;
    line-height: 1.4;
  }

  /* Cover Page */
  .cover {
    box-sizing: border-box;
    height: 95vh;
    max-height: 920px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    text-align: center;
    padding: 35px 25px;
    border: 3px double #b8860b;
    background: linear-gradient(180deg, #fafaf9 0%, #ffffff 100%);
    page-break-after: always;
  }

  .cover-header {
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 15px;
  }

  .institution-name {
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 2px;
    color: #0f172a;
    text-transform: uppercase;
  }

  .program-name {
    font-size: 10.5pt;
    font-weight: 500;
    color: #475569;
    margin-top: 4px;
  }

  .degree-name {
    font-size: 9.5pt;
    font-style: italic;
    color: #64748b;
    margin-top: 2px;
  }

  .cover-body {
    margin: 40px 0;
  }

  .cover-title {
    font-family: 'Cinzel', serif;
    font-size: 19pt;
    font-weight: 700;
    line-height: 1.35;
    color: #0f172a;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
    text-transform: uppercase;
  }

  .cover-subtitle {
    font-size: 11pt;
    font-weight: 600;
    color: #b8860b;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 18px;
  }

  .cover-tagline {
    font-size: 9.5pt;
    color: #475569;
    max-width: 580px;
    margin: 0 auto;
    line-height: 1.55;
  }

  .cover-footer {
    border-top: 2px solid #e2e8f0;
    padding-top: 15px;
  }

  .proponents-label {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 6px;
  }

  .proponents-names {
    font-size: 10pt;
    font-weight: 600;
    color: #1e293b;
    line-height: 1.5;
  }

  .cover-date {
    margin-top: 10px;
    font-size: 9.5pt;
    font-weight: 500;
    color: #64748b;
  }

  /* General Typography & Layout */
  h1 {
    font-size: 13pt;
    color: #0f172a;
    border-bottom: 2px solid #b8860b;
    padding-bottom: 3px;
    margin-top: 16px;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    page-break-after: avoid;
  }

  h2 {
    font-size: 10.5pt;
    color: #1e3a8a;
    margin-top: 12px;
    margin-bottom: 5px;
    border-left: 3.5px solid #1e3a8a;
    padding-left: 7px;
    page-break-after: avoid;
  }

  h3 {
    font-size: 9pt;
    color: #0f172a;
    margin-top: 8px;
    margin-bottom: 3px;
    font-weight: 700;
    page-break-after: avoid;
  }

  p {
    margin-bottom: 6px;
    text-align: justify;
  }

  ul, ol {
    margin-left: 16px;
    margin-bottom: 6px;
  }

  li {
    margin-bottom: 3px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 12px 0;
    font-size: 7.5pt;
    page-break-inside: auto;
  }

  tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }

  th {
    background-color: #0f172a;
    color: #ffffff;
    font-weight: 600;
    text-align: left;
    padding: 5px 6px;
    border: 1px solid #0f172a;
  }

  td {
    padding: 4px 6px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
  }

  tr:nth-child(even) {
    background-color: #f8fafc;
  }

  /* Callout Boxes */
  .callout {
    background-color: #f8fafc;
    border-left: 4px solid #b8860b;
    padding: 7px 10px;
    margin: 6px 0;
    border-radius: 0 4px 4px 0;
    font-size: 8pt;
  }

  .callout-title {
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 2px;
  }

  .badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-kept {
    background-color: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
  }

  .badge-revised {
    background-color: #e0f2fe;
    color: #0369a1;
    border: 1px solid #bae6fd;
  }

  .badge-removed {
    background-color: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }

  .badge-added {
    background-color: #f3e8ff;
    color: #6b21a8;
    border: 1px solid #e9d5ff;
  }

  .page-break {
    page-break-before: always;
  }

  .no-break {
    page-break-inside: avoid;
  }

  .meta-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    background-color: #f1f5f9;
    padding: 1px 3px;
    border-radius: 3px;
    color: #334155;
    font-weight: 600;
  }

  .section-desc {
    font-size: 8pt;
    color: #475569;
    margin-bottom: 8px;
    font-style: italic;
  }

  .footer-text {
    font-size: 7pt;
    color: #94a3b8;
    text-align: right;
    margin-top: 10px;
    border-top: 1px solid #e2e8f0;
    padding-top: 3px;
  }
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="cover">
  <div class="cover-header">
    <div class="institution-name">STI College Tanauan</div>
    <div class="program-name">Information and Communications Technology Program</div>
    <div class="degree-name">Bachelor of Science in Information Technology</div>
  </div>

  <div class="cover-body">
    <div class="cover-subtitle">Technical Documentation & Capstone Manuscript Guide</div>
    <div class="cover-title">A Web-Based Catering Reservation and Operations Management System for Trez Marias Catering Services</div>
    <div class="cover-tagline">
      Comprehensive System Capabilities, Role Access Specifications, Requirements Gap Analysis, and Formally Revised Software Requirements Specification (SRS)
    </div>
  </div>

  <div class="cover-footer">
    <div class="proponents-label">Prepared by the Capstone Proponents</div>
    <div class="proponents-names">
      Garcia, Kim Russel V. &nbsp;•&nbsp; Malacura, Joviel B.<br>
      Nora, Aritha Beatrice M. &nbsp;•&nbsp; Tenorio, Kurt Alden W.
    </div>
    <div class="cover-date">Academic Year 2025–2026 &nbsp;|&nbsp; October 2026</div>
  </div>
</div>

<!-- EXECUTIVE OVERVIEW -->
<h1>Executive Overview & System Architecture</h1>

<p>
  This document provides the authoritative technical reference and formal requirements documentation for the <strong>Web-Based Catering Reservation and Operations Management System for Trez Marias Catering Services</strong>. Trez Marias Catering Services is an enterprise catering business headquartered in Bilucao/Magapi, Malvar, Batangas. The system replaces fragmented manual recording, handwritten contract notebooks, and casual Facebook Messenger communication with a modern, cloud-based operations management platform.
</p>

<div class="callout">
  <div class="callout-title">Core Architectural Foundation</div>
  The platform is engineered as a production-grade <strong>modular monorepo</strong> adhering to complete architectural separation of concerns between client-facing interactions and business administration:
  <ul style="margin-top: 3px; margin-bottom: 0;">
    <li><strong>Customer Web Portal (<span class="meta-tag">apps/client</span>)</strong>: Lightweight, mobile-first responsive single-page application (SPA) built with React 18, Vite 5, and Material-UI (MUI). Dedicated exclusively to customer reservations, catalog exploration, quotation review, payments, and messaging.</li>
    <li><strong>Admin Operations Dashboard (<span class="meta-tag">apps/admin</span>)</strong>: High-density administrative workspace built with React 18 and MUI, isolated on its own deployable subdomain to completely prevent administrative leaks.</li>
    <li><strong>Enterprise REST API (<span class="meta-tag">apps/api</span>)</strong>: Scalable Express 5 backend running on Node.js with strict transactional locks, JWT HS256 authentication, bcrypt credential hashing, and outbox communication engines.</li>
    <li><strong>Relational Database Engine (<span class="meta-tag">MySQL 8.0</span>)</strong>: 32 structured tables enforcing foreign-key referential integrity, JSON snapshot columns, atomic counters, and append-only activity auditing.</li>
    <li><strong>Shared Domain Package (<span class="meta-tag">@tm/shared</span>)</strong>: Centralized repository for pure business rules, pricing engines, calendar capacity calculators, and validation schemas shared across portals.</li>
  </ul>
</div>

<h1>Section 1: Detailed System and User Capabilities</h1>

<h2>1.1 System Capabilities (Core Engine & Autonomous Processes)</h2>
<ul>
  <li><strong>Multi-Service Booking Engine</strong>: Dynamically coordinates three distinct catering service types:
    <ol style="margin-left: 15px;">
      <li><em>Buffet & Catering</em>: Equipment package paired with custom 4-course food preparations billed on a per-plate guest fee.</li>
      <li><em>Catering Only</em>: Flat-fee tableware, linens, chafing warmers, and banquet furniture package without food provision.</li>
      <li><em>Equipment Rental</em>: Standalone piece-by-piece rental of specific inventory assets (monobloc chairs, dinnerware, warmers) with live availability checks.</li>
    </ol>
  </li>
  <li><strong>Intelligent Conflict Prevention & Capacity Enforcement</strong>:
    Enforces a strict 2-day minimum advance booking notice (<span class="meta-tag">leadDays: 2</span>), 2-hour pre- and post-event buffer windows for logistics setup/teardown, configurable daily event capacity thresholds (1 to 10 events/day), and administrative date blocking.
  </li>
  <li><strong>Dynamic Quotation & Repricing Pipeline</strong>:
    Automatically computes complex quotations factoring package baselines, per-guest food charges, itemized add-on quantities, standard or custom delivery fees, promotional discounts, and return damage penalties.
  </li>
  <li><strong>Dual-Track Financial Processing</strong>:
    Combines manual receipt inspection (GCash, BPI bank transfer slips) with automated e-wallet gateway capabilities (PayMongo QR Ph integration), issuing audit-safe sequential Official Receipts (<span class="meta-tag">OR-####</span>).
  </li>
  <li><strong>Real-Time Equipment Inventory Tracking</strong>:
    Maintains continuous stock visibility across 7 categories (<span class="meta-tag">Total</span>, <span class="meta-tag">In Use</span>, <span class="meta-tag">Available</span>, <span class="meta-tag">Damaged</span>), automatically reserving assets during event approvals and logging returns.
  </li>
  <li><strong>Automated Vendor Outsourcing Dispatch</strong>:
    Generates formal rental contracts (<span class="meta-tag">OUT-YYYY-####</span>) for external suppliers (lights, sound, tents, vehicles, extra staff) and dispatches them automatically via SMS or Email with status lifecycle monitoring.
  </li>
  <li><strong>Real-Time Data Synchronization Polling</strong>:
    Monitors an atomic write counter (<span class="meta-tag">change</span> stamp), synchronizing data views across open customer and admin tabs every 15 seconds without full page refreshes.
  </li>
  <li><strong>Multi-Channel Outbox Communication</strong>:
    Maintains an append-only outbox table (<span class="meta-tag">outbox</span>) with provider fallback logging, guaranteeing delivery auditability for all booking alerts, payment notices, and reminders.
  </li>
</ul>

<h2>1.2 Customer Capabilities (Customer Web Portal)</h2>
<ul>
  <li><strong>Authentication & Security</strong>: Account registration, secure credential sign-in, SMS OTP password recovery, profile editing, and 15-minute idle timeout protection.</li>
  <li><strong>Catalog Exploration</strong>: Browse packages, examine tableware inclusions, inspect rentable equipment piece prices and replacement damage fees, and check live date availability.</li>
  <li><strong>Step-by-Step Event Reservation</strong>: Complete an interactive booking form with automatic local draft autosaving; select occasion type, event date, time, and guest count (50–2,000 guests).</li>
  <li><strong>Menu & Dietary Customization</strong>: Configure 4-course menus (Pork, Chicken, Fish, Vegetable) with autocomplete suggestions or custom dish names, and input special food preparation notes (allergies, vegetarian portions, senior-friendly food).</li>
  <li><strong>Fulfillment & Venue Specification</strong>: Select between Free Customer Pick-up (at Magapi, Malvar) or Delivery with full street address and venue gate access notes.</li>
  <li><strong>Add-On Amenities Selection</strong>: Choose optional services (extra waitstaff, sound systems, specialized tents) with item quantity specifications.</li>
  <li><strong>Reservation Tracking & Quotation Review</strong>: Track progress along a 6-stage status pipeline, review itemized quotations, and accept or dispute terms.</li>
  <li><strong>Controlled Online Self-Cancellation</strong>: Cancel reservations online prior to administrative kitchen preparation commencement (<span class="meta-tag">Started Preparing</span>) within calculated notice windows.</li>
  <li><strong>Payment Submission & Receipt Archival</strong>: Pay flexible downpayments (&ge; minimum downpayment threshold), upload receipt screenshots, generate QR Ph payment codes, and access digital official receipts.</li>
  <li><strong>Direct Support Chat</strong>: Conduct 1-on-1 conversations with catering administrators, receiving automated status cards directly in the message thread.</li>
  <li><strong>Multi-Criteria Service Reviews</strong>: Rate completed events across overall stars (1–5) and four performance categories (Food, Service, Punctuality, Setup) with written testimonials.</li>
</ul>

<h2>1.3 Administrator Capabilities (Admin Operations Dashboard)</h2>
<ul>
  <li><strong>Multi-Factor Access & Auditing</strong>: Two-stage login with 6-digit email OTP challenges, active session auditing, and brute-force lockout controls.</li>
  <li><strong>Central Operations Hub</strong>: Live KPI statistics (pending requests, weekly upcoming events, payments awaiting review, monthly sales, equipment alerts) and an event activity stream.</li>
  <li><strong>Reservation Moderation & Quotation Builder</strong>: Approve/decline reservations with mandatory explanations; price add-ons, add custom fees, apply discounts, set downpayment deadlines, and edit logistics.</li>
  <li><strong>Kitchen Lockout ("Started Preparing")</strong>: Formally lock reservations from customer online self-cancellation once kitchen operations or resource staging have started.</li>
  <li><strong>Interactive Calendar & Capacity Management</strong>: Schedule events on a visual monthly calendar, set global daily event limits (1–10/day), and block dates for maintenance or private events.</li>
  <li><strong>Payment Verification & Financial Records</strong>: Examine uploaded payment slips, verify transaction amounts, generate official receipts (<span class="meta-tag">OR-####</span>), reject invalid slips, record physical cash payments, and process customer refunds (<span class="meta-tag">recordRefund</span>).</li>
  <li><strong>Equipment Inventory Lifecycle Management</strong>: Track owned assets, execute event check-outs and returns, report damages, record repairs, dispose of unsalvageable assets, and configure rentable items with damage fees.</li>
  <li><strong>Outsourced Partner Logistics</strong>: Manage third-party suppliers, build outsourced contracts (<span class="meta-tag">OUT-YYYY-####</span>), dispatch contracts via Email/SMS, and log vendor responses.</li>
  <li><strong>Customer Relationship Management (CRM)</strong>: View customer directory, filter by booking frequency or balances, view customer reservation histories, and initiate direct chats.</li>
  <li><strong>Review Moderation & Marketing Controls</strong>: Moderate customer feedback, publish reviews to the public website, pin top reviews as "Featured" on the homepage, and reply to testimonials.</li>
  <li><strong>Financial Analytics & Exporting</strong>: Generate net sales summaries, revenue breakdown by payment channel, package conversion analytics, and outstanding balance reports with plain-text (.txt) and print exporting.</li>
</ul>

<!-- COMPARATIVE ANALYSIS -->
<div class="page-break"></div>
<h1>Section 2: Comparative Analysis of Manuscript Requirements</h1>
<p class="section-desc">
  The table below evaluates every requirement from the Capstone Manuscript (pages 31–35, REQ 001–REQ 024) against the implemented system, documenting all retentions, revisions, removals, and architectural additions with academic justifications.
</p>

<table>
  <thead>
    <tr>
      <th style="width: 10%;">ID</th>
      <th style="width: 25%;">Manuscript Description</th>
      <th style="width: 11%;">Action</th>
      <th style="width: 54%;">Technical & Operational Justification</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>REQ 001</strong></td>
      <td>User login integration supporting separate customer and admin accounts.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Implemented via dual decoupled portals (<span class="meta-tag">apps/client</span> and <span class="meta-tag">apps/admin</span>) with distinct storage keys, JWT payload roles, and separate login endpoints.</td>
    </tr>
    <tr>
      <td><strong>REQ 002</strong></td>
      <td>Require admin authentication before access to admin functions is granted.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained and enhanced. Hardened with 2FA email OTP challenges (<span class="meta-tag">auth_challenges</span>), session verification, and strict backend route guards.</td>
    </tr>
    <tr>
      <td><strong>REQ 003</strong></td>
      <td>Require customer personal details before entering reservation parameters.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Customer authentication gate requires verified contact details prior to accessing the booking form, auto-populating reservation contact attributes.</td>
    </tr>
    <tr>
      <td><strong>REQ 004</strong></td>
      <td>Enter detailed reservation parameters including venue, date/time, theme, color palette, and up to 3 reference photos.</td>
      <td><span class="badge badge-revised">Revised</span></td>
      <td><strong>Revised</strong>: The production system focuses on structured operational parameters (Event Name, Occasion, Service Type, 4-Course Menu, Guests, Fulfillment, Venue, Access Notes). In professional catering workflows, styling themes and decorative photos are exchanged flexibly via direct chat or handled by external decorators; file uploads in core database transactions are strictly dedicated to high-security payment proofs.</td>
    </tr>
    <tr>
      <td><strong>REQ 005</strong></td>
      <td>Allow customer to edit/update reservation details before and after admin approves.</td>
      <td><span class="badge badge-revised">Revised</span></td>
      <td><strong>Revised</strong>: Allowing unmoderated customer edits after administrative approval causes critical pricing, scheduling, and inventory clashes. In the system, customers can edit drafts freely before submission, request changes via the integrated chat thread after approval, or cancel online within a strict notice window before kitchen operations begin. Admin retains full authority to modify logistics and re-quote.</td>
    </tr>
    <tr>
      <td><strong>REQ 006</strong></td>
      <td>Customize packages using dietary restriction filters (vegetarian, vegan, gluten-free, halal, etc.).</td>
      <td><span class="badge badge-revised">Revised</span></td>
      <td><strong>Revised</strong>: Arbitrary database filter toggles artificially restrict catering menu options. The system implements a flexible 4-category menu builder (Pork, Chicken, Fish, Vegetable) with catalog autocomplete suggestions and open text input, paired with a dedicated <span class="meta-tag">foodNotes</span> field for allergies, vegetarian portions, and diet constraints that directly populate kitchen prep sheets.</td>
    </tr>
    <tr>
      <td><strong>REQ 007</strong></td>
      <td>Allow customer to track reservation status.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Features a real-time visual status pipeline (<span class="meta-tag">pending</span> &rarr; <span class="meta-tag">approved</span> &rarr; <span class="meta-tag">downpayment_paid</span> &rarr; <span class="meta-tag">confirmed</span> &rarr; <span class="meta-tag">completed</span>, plus <span class="meta-tag">declined</span> / <span class="meta-tag">cancelled</span>).</td>
    </tr>
    <tr>
      <td><strong>REQ 008</strong></td>
      <td>Support recording payment methods (cash, bank transfer, GCash, Maya) and admin verification of proofs.</td>
      <td><span class="badge badge-revised">Revised</span></td>
      <td><strong>Revised</strong>: Expanded to incorporate automated dynamic QR Ph / PayMongo e-wallet processing in addition to manual GCash, Bank Transfer, and physical Cash receipting, along with configurable downpayment minimums and refund tracking.</td>
    </tr>
    <tr>
      <td><strong>REQ 009</strong></td>
      <td>Feature chatbot to facilitate real-time communication for customer inquiries.</td>
      <td><span class="badge badge-removed">Removed</span></td>
      <td><strong>Removed</strong>: Automated chatbots fail to handle nuanced catering consultations regarding customized menus, venue logistical hurdles, and specialized pricing policies. Replaced entirely with a direct Customer-to-Admin real-time chat system with automated system notifications.</td>
    </tr>
    <tr>
      <td><strong>REQ 010</strong></td>
      <td>Feature live chat support system between customers and administrators.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Implemented via persistent conversation threads (<span class="meta-tag">threads</span>, <span class="meta-tag">messages</span>) with unread counters, reservation tagging, and automated quotation/receipt message cards.</td>
    </tr>
    <tr>
      <td><strong>REQ 011</strong></td>
      <td>Send notifications to customers via SMS and email for approvals/rejections, payment verifications, and reminders.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Handled via background outbox services with fallback logging, dispatching alerts for approvals, official receipts, payment reminders, and contract notices.</td>
    </tr>
    <tr>
      <td><strong>REQ 012</strong></td>
      <td>Display past customer feedback in a reviews/testimonials section on the website.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained and enhanced with a multi-criteria rating system (Food, Service, Punctuality, Setup) and administrative moderation (Publish/Feature/Reply).</td>
    </tr>
    <tr>
      <td><strong>REQ 013</strong></td>
      <td>Provide admin with a calendar to schedule and oversee events to avoid conflicts.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Features interactive monthly calendar views, buffer hour enforcement, daily event capacity limits, and administrative date blocking.</td>
    </tr>
    <tr>
      <td><strong>REQ 014</strong></td>
      <td>Allow admin to assign number of cooks, servers, and setup crews based on event details.</td>
      <td><span class="badge badge-revised">Revised</span></td>
      <td><strong>Revised</strong>: Trez Marias operates as an SME utilizing on-call crews and external labor. Staffing is handled via package inclusions, customer add-on selections (e.g., additional waitstaff), and the Outsourcing Module (<span class="meta-tag">outsource_partners</span> for extra crew), rather than an internal human resources roster.</td>
    </tr>
    <tr>
      <td><strong>REQ 015</strong></td>
      <td>Allow admin to manage and assign an Items & Equipment Checklist.</td>
      <td><span class="badge badge-revised">Revised</span></td>
      <td><strong>Revised</strong>: Replaced and upgraded to a full Equipment Inventory Management System tracking owned assets, event check-outs, returns, damaged items, and low-stock alerts.</td>
    </tr>
    <tr>
      <td><strong>REQ 016</strong></td>
      <td>Allow admin to generate net profit reports per event and per month.</td>
      <td><span class="badge badge-revised">Revised</span></td>
      <td><strong>Revised</strong>: Catering SMEs without integrated wholesale food purchasing cannot compute true accounting net profit. The system accurately delivers Sales and Net Revenue Reports (gross payments minus refunds and partner costs), monthly method distributions, and outstanding balance summaries.</td>
    </tr>
    <tr>
      <td><strong>REQ 017</strong></td>
      <td>Security: Restrict access to reservation flows and sensitive data via user authentication.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Enforced via JWT tokens, bcrypt credential hashing, and role-based route middleware.</td>
    </tr>
    <tr>
      <td><strong>REQ 018</strong></td>
      <td>Security: Protect stored customer, reservation, menu, payment, and logistics data from unauthorized access.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Secured via parameterized SQL queries, foreign key constraints, and input sanitization.</td>
    </tr>
    <tr>
      <td><strong>REQ 019</strong></td>
      <td>Operational: Function as localized, SME-focused platform aligned with catering workflow.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Accurately models the real-world operational flows of Trez Marias in Malvar, Batangas.</td>
    </tr>
    <tr>
      <td><strong>REQ 020</strong></td>
      <td>Operational: Highly responsive and accessible across desktops, laptops, tablets, and mobile devices.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Fully responsive UI built using MUI breakpoints and adaptive navigation bars.</td>
    </tr>
    <tr>
      <td><strong>REQ 021</strong></td>
      <td>Performance: Save records, process chat messages, and update payments within 5 seconds.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Database queries and REST API endpoints execute under 500ms under standard loads.</td>
    </tr>
    <tr>
      <td><strong>REQ 022</strong></td>
      <td>Performance: Retrieve records and generate reports within 5 seconds.</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Single-query indexed aggregation generates analytical reports in sub-second times.</td>
    </tr>
    <tr>
      <td><strong>REQ 023</strong></td>
      <td>Cultural/Political: Customer information used solely for internal operations (Data Privacy Act).</td>
      <td><span class="badge badge-kept">Kept</span></td>
      <td>Retained. Public review endpoints redact customer email addresses, account IDs, and contact numbers.</td>
    </tr>
    <tr>
      <td><strong>REQ 024</strong></td>
      <td>Cultural/Political: Accommodate diverse dietary preferences during package customization.</td>
      <td><span class="badge badge-revised">Revised</span></td>
      <td><strong>Revised</strong>: Merged into REQ 006 (Flexible 4-course menu builder and kitchen food notes).</td>
    </tr>
    <tr>
      <td><strong>REQ-NEW 1</strong></td>
      <td>Standalone Equipment Rental Subsystem.</td>
      <td><span class="badge badge-added">Added</span></td>
      <td>Enables customers to rent tables, chairs, and dinnerware individually with live stock checking and fulfillment choice (pickup/delivery).</td>
    </tr>
    <tr>
      <td><strong>REQ-NEW 2</strong></td>
      <td>Dynamic Quotation Builder with Additional Charges & Discounts.</td>
      <td><span class="badge badge-added">Added</span></td>
      <td>Allows admin to price add-ons, add custom charges, provide discounts, and issue official binding quotations.</td>
    </tr>
    <tr>
      <td><strong>REQ-NEW 3</strong></td>
      <td>Third-Party Vendor Outsourcing Management.</td>
      <td><span class="badge badge-added">Added</span></td>
      <td>Enables admin to manage suppliers (lights/sound, tents, vehicles, extra staff) and generate/dispatch digital rental contracts (<span class="meta-tag">OUT-YYYY-####</span>).</td>
    </tr>
    <tr>
      <td><strong>REQ-NEW 4</strong></td>
      <td>Online Cancellation Window & Refund Tracking.</td>
      <td><span class="badge badge-added">Added</span></td>
      <td>Enforces mathematical cancellation cutoff windows for paid events and provides administrative refund tracking for cancellations and overpayments.</td>
    </tr>
    <tr>
      <td><strong>REQ-NEW 5</strong></td>
      <td>Cross-Portal Real-Time Synchronization.</td>
      <td><span class="badge badge-added">Added</span></td>
      <td>Implements lightweight change-stamp polling so updates on the client or admin portal synchronize across active browser sessions without reloads.</td>
    </tr>
  </tbody>
</table>

<!-- FORMAL REQUIREMENTS SPECIFICATION -->
<div class="page-break"></div>
<h1>Section 3: Formal System Requirements Specification (SRS)</h1>

<h2>1.0 Functional Requirements</h2>

<h3>1.1 Account & Access Management</h3>
<ul>
  <li><strong>REQ-FR-001: Role-Based User Authentication</strong><br>
    The system shall provide separate authentication mechanisms for customers and administrators. Customer credentials shall grant access exclusively to the Customer Portal, while administrative credentials shall grant access to the Admin Dashboard.
  </li>
  <li><strong>REQ-FR-002: Multi-Factor Administrative Authentication</strong><br>
    The system shall require administrators to undergo two-factor authentication, requiring a valid password followed by a temporary 6-digit verification code delivered to their registered email address.
  </li>
  <li><strong>REQ-FR-003: Customer Profile & Credential Recovery</strong><br>
    The system shall allow customers to manage their profile information, change passwords, and recover forgotten passwords using a 6-digit SMS verification code delivered to their registered mobile phone.
  </li>
  <li><strong>REQ-FR-004: Brute-Force Protection & Session Inactivity</strong><br>
    The system shall automatically lock user accounts for a duration of five (5) minutes following five (5) consecutive failed login attempts, and automatically terminate active user sessions after fifteen (15) minutes of inactivity.
  </li>
</ul>

<h3>1.2 Reservation & Service Customization</h3>
<ul>
  <li><strong>REQ-FR-005: Multi-Service Reservation Selection</strong><br>
    The system shall support three distinct catering reservation types: (1) <em>Buffet and Catering</em> (package equipment combined with custom prepared food billed per guest plate), (2) <em>Catering Only</em> (banquet equipment and tableware package without food service), and (3) <em>Equipment Rental</em> (individual rental of specific inventory items billed per piece).
  </li>
  <li><strong>REQ-FR-006: Event Parameter Specification</strong><br>
    The system shall capture complete event parameters during booking, including event name, occasion type, event date, start time, guest count (minimum 50, maximum 2,000 guests), venue name, complete street address, city, and logistical access notes.
  </li>
  <li><strong>REQ-FR-007: Custom Menu Builder & Dietary Accommodations</strong><br>
    The system shall provide a 4-course menu selection builder (<em>Pork dish</em>, <em>Chicken dish</em>, <em>Fish dish</em>, and <em>Vegetable dish</em>) featuring catalog autocomplete suggestions and open text input, alongside a dedicated dietary requirements field (<span class="meta-tag">foodNotes</span>) to capture guest allergies, vegetarian/vegan preferences, and special cooking instructions.
  </li>
  <li><strong>REQ-FR-008: Equipment Rental Fulfillment Selection</strong><br>
    The system shall allow equipment rental customers to specify fulfillment through either <em>Customer Pick-up</em> (at the Trez Marias business premises in Magapi, Malvar) or <em>Delivery</em> (subject to delivery fee calculation and venue delivery address specification).
  </li>
  <li><strong>REQ-FR-009: Add-On Service Selection</strong><br>
    The system shall allow customers to select additional event amenities (such as extra waitstaff, sound systems, specialized tents, and tableware extensions) with user-defined item quantities where applicable.
  </li>
  <li><strong>REQ-FR-010: Form Autosave & Draft Recovery</strong><br>
    The system shall automatically save in-progress booking forms to local browser storage, allowing customers to resume uncompleted reservation requests without losing entered data.
  </li>
</ul>

<h3>1.3 Booking Lifecycle & Operations Management</h3>
<ul>
  <li><strong>REQ-FR-011: Real-Time Reservation Status Tracking</strong><br>
    The system shall provide a visual status tracking pipeline indicating the exact stage of a booking: <span class="meta-tag">pending</span>, <span class="meta-tag">approved</span>, <span class="meta-tag">downpayment_paid</span>, <span class="meta-tag">confirmed</span>, <span class="meta-tag">completed</span>, <span class="meta-tag">declined</span>, or <span class="meta-tag">cancelled</span>.
  </li>
  <li><strong>REQ-FR-012: Dynamic Quotation Generation</strong><br>
    The system shall enable the administrator to price custom add-ons, add delivery fees, apply promotional discounts, add administrative notes, and issue binding digital quotations to customers.
  </li>
  <li><strong>REQ-FR-013: Administrative Reservation Moderation</strong><br>
    The system shall allow the administrator to approve incoming reservations, decline bookings with a mandatory explanation, and modify event logistics (date, time, guest count, and venue).
  </li>
  <li><strong>REQ-FR-014: Kitchen Preparation Lockout ("Started Preparing")</strong><br>
    The system shall allow administrators to flag an event as "Started Preparing," which formally prevents customers from executing online self-cancellations once food preparation and resource deployment have commenced.
  </li>
  <li><strong>REQ-FR-015: Controlled Cancellation Policy</strong><br>
    The system shall allow customers to cancel unpaid reservations at any time, while restricting paid booking cancellations to a pre-defined notice window (the first 25% of the duration between booking submission and event date, or 50% for bookings placed 6+ months in advance) prior to preparation commencement.
  </li>
  <li><strong>REQ-FR-016: Change Request Submission</strong><br>
    The system shall allow customers to submit structured change requests to administrators through the integrated chat thread for event adjustments after a booking has been approved.
  </li>
</ul>

<h3>1.4 Scheduling, Calendar & Logistics</h3>
<ul>
  <li><strong>REQ-FR-017: Event Scheduling Calendar & Conflict Prevention</strong><br>
    The system shall provide a monthly scheduling calendar that enforces a 2-day advance booking notice, maintains a 2-hour buffer between events, and prevents bookings on blocked dates.
  </li>
  <li><strong>REQ-FR-018: Daily Booking Capacity Enforcement</strong><br>
    The system shall allow administrators to set a global daily event capacity limit (1 to 10 events per calendar day), automatically preventing further customer bookings once the limit is reached.
  </li>
  <li><strong>REQ-FR-019: Administrative Date Blocking</strong><br>
    The system shall allow administrators to block specific calendar dates with standardized reasons (<em>Fully booked</em>, <em>Private event</em>, <em>Maintenance</em>).
  </li>
</ul>

<h3>1.5 Equipment Inventory & Outsourced Vendor Management</h3>
<ul>
  <li><strong>REQ-FR-020: Equipment Inventory Lifecycle Tracking</strong><br>
    The system shall track catering equipment assets by category (<em>Furniture</em>, <em>Linens</em>, <em>Serving ware</em>, <em>Tableware</em>, <em>Kitchen</em>, <em>Tents/Stage</em>, <em>Decor</em>), monitoring quantities categorized as <em>Available</em>, <em>In Use</em>, and <em>Damaged</em>, with automated low-stock warnings.
  </li>
  <li><strong>REQ-FR-021: Equipment Allocation & Return Logging</strong><br>
    The system shall record equipment check-outs linked to specific reservations, log asset returns, record damaged equipment, track repairs, and log asset disposals within an append-only inventory history log.
  </li>
  <li><strong>REQ-FR-022: Equipment Rental Stock & Damage Penalties</strong><br>
    The system shall allow administrators to flag inventory assets as rentable to the public, set rental rates per piece, set replacement damage fees, and record returned damaged pieces with automated quotation penalties.
  </li>
  <li><strong>REQ-FR-023: Outsourcing Partner Management</strong><br>
    The system shall maintain a directory of third-party rental partners (lighting, sound, tents, vehicles, extra staff) and enable the creation of digital rental contracts (<span class="meta-tag">OUT-YYYY-####</span>) linked to catering reservations.
  </li>
  <li><strong>REQ-FR-024: Automated Partner Contract Dispatch</strong><br>
    The system shall dispatch formal outsourcing contracts directly to vendor partners via automated SMS or Email, tracking contract states (<em>Draft</em>, <em>Sent</em>, <em>Accepted</em>, <em>Declined</em>, <em>Completed</em>, <em>Cancelled</em>).
  </li>
</ul>

<h3>1.6 Payments, Billing & Financial Tracking</h3>
<ul>
  <li><strong>REQ-FR-025: Multi-Channel Payment Submission</strong><br>
    The system shall support customer payment submissions via GCash, Bank Transfer, physical Cash, and dynamic QR Ph (PayMongo) e-wallet transactions.
  </li>
  <li><strong>REQ-FR-026: Proof of Payment Verification</strong><br>
    The system shall allow customers to upload transaction receipts (JPEG, PNG, PDF) with reference numbers, and enable administrators to examine, approve, or reject submitted proofs.
  </li>
  <li><strong>REQ-FR-027: Configurable Minimum Downpayment Threshold</strong><br>
    The system shall enforce a minimum downpayment threshold (configurable between &#8369;1,000 and &#8369;100,000, default &#8369;3,000), allowing customers to pay any amount between the minimum threshold and the full reservation balance.
  </li>
  <li><strong>REQ-FR-028: Over-the-Counter Cash Recording</strong><br>
    The system shall allow administrators to record walk-in or on-site cash payments directly into the reservation financial record.
  </li>
  <li><strong>REQ-FR-029: Official Receipt Generation</strong><br>
    The system shall automatically generate a unique, sequential Official Receipt number (<span class="meta-tag">OR-####</span>) upon successful verification of every payment transaction.
  </li>
  <li><strong>REQ-FR-030: Refund Recording & Processing</strong><br>
    The system shall track outstanding refunds owed to customers resulting from cancellations, declined bookings, or quotation overpayments, and allow administrators to log refund disbursements.
  </li>
  <li><strong>REQ-FR-031: Outstanding Balance Monitoring & Reminders</strong><br>
    The system shall track outstanding balances across all active bookings and provide administrators with a one-click automated payment reminder feature dispatched via SMS and email.
  </li>
</ul>

<h3>1.7 Communication, Customer Support & Testimonials</h3>
<ul>
  <li><strong>REQ-FR-032: Direct Customer-Admin Chat Hub</strong><br>
    The system shall provide a real-time messaging interface enabling direct communication between authenticated customers and administrators, with message read indicators and unread message counters.
  </li>
  <li><strong>REQ-FR-033: Automated Transactional Chat Notices</strong><br>
    The system shall automatically insert system event cards into the customer chat thread upon key milestones, including quotation dispatch, approval alerts, official receipts, and cancellation notices.
  </li>
  <li><strong>REQ-FR-034: Multi-Criteria Post-Event Reviews</strong><br>
    The system shall enable customers with completed events to submit reviews consisting of an overall star rating (1–5), individual ratings across four categories (<em>Food quality</em>, <em>Service</em>, <em>Punctuality</em>, <em>Setup/ambiance</em>), and a written testimonial.
  </li>
  <li><strong>REQ-FR-035: Review Moderation & Homepage Featuring</strong><br>
    The system shall allow administrators to moderate customer feedback, publish reviews for public display, feature selected testimonials on the homepage, and submit direct administrative replies that notify the customer.
  </li>
</ul>

<h3>1.8 Analytics, Reporting & Synchronization</h3>
<ul>
  <li><strong>REQ-FR-036: Financial Analytics & Net Revenue Reporting</strong><br>
    The system shall generate financial summaries reporting gross verified payments, total refunds issued, net revenue, payment method breakdowns, conversion rates, and package popularity rankings across customizable date ranges (<em>This year</em>, <em>Last 12 months</em>, <em>Last year</em>, <em>All time</em>).
  </li>
  <li><strong>REQ-FR-037: Report Exporting & Printing</strong><br>
    The system shall support the export of financial summaries and balance reports into formatted plain-text (.txt) files and print-optimized browser views.
  </li>
  <li><strong>REQ-FR-038: Cross-Portal Real-Time Synchronization</strong><br>
    The system shall monitor an atomic database change stamp via background polling (every 15 seconds during active browser visibility), automatically refreshing data views across open customer and admin tabs without full page reloads.
  </li>
</ul>

<h2>2.0 Non-Functional Requirements</h2>

<h3>2.1 Security Requirements</h3>
<ul>
  <li><strong>REQ-NFR-001: Access Token Security</strong><br>
    The system shall secure all REST API interactions using JSON Web Tokens (JWT) signed with HS256 encryption, validating user identities and roles (<span class="meta-tag">customer</span> vs. <span class="meta-tag">admin</span>) on every non-public request.
  </li>
  <li><strong>REQ-NFR-002: Cryptographic Password Storage</strong><br>
    The system shall hash all stored user passwords using bcrypt with a minimum work factor of 10, ensuring plaintext credentials are never stored or logged.
  </li>
  <li><strong>REQ-NFR-003: SQL Injection & Parameterized Transactions</strong><br>
    The system shall prevent SQL injection vulnerabilities by executing all database transactions through parameterized queries and prepared statements via MySQL2.
  </li>
  <li><strong>REQ-NFR-004: Upload File Quarantine & Type Validation</strong><br>
    The system shall store uploaded payment proofs in an isolated storage directory outside the public web root, validating MIME types and file signatures against spoofing attacks.
  </li>
</ul>

<h3>2.2 Performance Requirements</h3>
<ul>
  <li><strong>REQ-NFR-005: API Response Latency</strong><br>
    The system REST API shall process and respond to data retrieval and record persistence operations within two (2) seconds under normal operational loads.
  </li>
  <li><strong>REQ-NFR-006: Analytical Report Compilation Time</strong><br>
    The system shall compile aggregated financial and sales reports across historical reservation datasets within three (3) seconds.
  </li>
  <li><strong>REQ-NFR-007: Background Polling Overhead</strong><br>
    The background synchronization polling mechanism shall execute lightweight conditional change-counter checks consuming less than 100 bytes per check when no data changes occur.
  </li>
</ul>

<h3>2.3 Usability & Operational Requirements</h3>
<ul>
  <li><strong>REQ-NFR-008: Responsive Cross-Device UI</strong><br>
    The user interface shall be fully responsive across desktop monitors, laptops, tablets, and mobile smartphones, utilizing adaptive layouts, collapsible sidebars, and touch-optimized input targets.
  </li>
  <li><strong>REQ-NFR-009: SME Operational Alignment</strong><br>
    The system workflows shall strictly model the day-to-day operations, pricing rules, and fulfillment practices of Trez Marias Catering Services in Malvar, Batangas.
  </li>
  <li><strong>REQ-NFR-010: Offline Draft Resilience</strong><br>
    The Customer Portal shall retain unsubmitted reservation entries in browser storage across page refreshes or unexpected network disconnections.
  </li>
</ul>

<h3>2.4 Cultural, Legal & Data Privacy Requirements</h3>
<ul>
  <li><strong>REQ-NFR-011: Data Privacy Act (RA 10173) Compliance</strong><br>
    The system shall restrict access to customer personally identifiable information (PII) solely to authorized administrative operations. Public review and testimonial endpoints shall redact customer email addresses, account IDs, and contact numbers.
  </li>
  <li><strong>REQ-NFR-012: Inclusive Dietary Accommodation</strong><br>
    The system shall support cultural, health, and religious dietary preferences through open-ended dish customization fields and kitchen preparation alert notes.
  </li>
</ul>

<!-- DEFENSE RECOMMENDATIONS -->
<div class="page-break"></div>
<h1>Section 4: Manuscript Defense Guidance & Diagram Alignment</h1>

<div class="callout">
  <div class="callout-title">Panel Defense Strategy: Explaining Requirements Evolution</div>
  When presenting your revised requirements to the Capstone Review Panel, emphasize that the revisions reflect an <strong>Agile Scrum evolution</strong> based on actual operational discovery with Trez Marias Catering Services:
  <ul style="margin-top: 3px; margin-bottom: 0;">
    <li><strong>Transition from Chatbot (REQ 009) to Direct Human Messaging (REQ-FR-032)</strong>: Explain to the panel that catering is a high-touch, customized service where automated chatbots fail to capture specific banquet setup logistics, dietary sensitivities, and custom pricing negotiations. Direct 1-on-1 chat with automated system cards ensures 100% operational reliability.</li>
    <li><strong>Upgrading from Simple Checklists (REQ 015) to Inventory Lifecycle Management (REQ-FR-020 to 022)</strong>: A passive checklist does not prevent loss of catering assets. Upgrading to a real-time tracking system (allocating equipment to events and logging returns and damage fees) directly solves the business problem of lost and broken tableware.</li>
    <li><strong>Introducing Third-Party Vendor Outsourcing (REQ-FR-023 to 024)</strong>: A small catering SME cannot own every luxury amenity (sound systems, specialized lighting, staging, giant tents). Adding the Outsourcing module directly aligns with industry reality where caterers sub-contract specialized vendors.</li>
    <li><strong>Clarifying Net Revenue vs. Net Profit (REQ 016)</strong>: Defend that a reservation management system computes sales, verified revenues, retained fees, and refunds. Computing true net profit would require tracking daily fluctuating wet-market meat/vegetable invoices and utility bills, which falls under accounting ERP software rather than a reservation and operations management system.</li>
  </ul>
</div>

<h2>Diagram Updates for Chapter 3</h2>
<ul>
  <li><strong>Use Case Diagram (Figure 2)</strong>:
    Ensure the Admin actor includes use case bubbles for:
    <em>Manage Equipment Inventory</em>, <em>Manage Outsourced Partners & Contracts</em>, and <em>Process Refunds & Balances</em>.
    Ensure the Customer actor shows <em>Rent Standalone Equipment</em> and <em>Submit Payment / Scan QR Ph</em>.
  </li>
  <li><strong>Data Flow Diagram (Figures 4 & 5)</strong>:
    Update Level 1 DFD processes:
    Process 7.0 should be expanded from simple "Logistics" to <em>Inventory & Stock Allocation (<span class="meta-tag">D4 Inventory</span>)</em>.
    Add Process 10.0: <em>Manage Outsourcing (<span class="meta-tag">D6 Outsource Partners & Contracts</span>)</em>.
    Update Process 9.0 (Process Payment) to include datastore linkages to <span class="meta-tag">D7 Refunds</span>.
  </li>
</ul>

<div class="footer-text">
  A Web-Based Catering Reservation and Operations Management System for Trez Marias Catering Services &nbsp;|&nbsp; STI College Tanauan &nbsp;|&nbsp; Capstone Proposal Documentation
</div>

</body>
</html>
"""

temp_dir = tempfile.gettempdir()
html_path = os.path.join(temp_dir, "trez_marias_requirements.html")
pdf_temp_path = os.path.join(temp_dir, "trez_marias_requirements.pdf")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
browser_path = edge_path if os.path.exists(edge_path) else chrome_path

cmd = [
    browser_path,
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    f"--print-to-pdf={pdf_temp_path}",
    html_path
]

subprocess.run(cmd, check=True)

if os.path.exists(pdf_temp_path):
    target_docs = os.path.join(os.getcwd(), "docs", "Trez_Marias_System_Capabilities_and_Requirements_Documentation.pdf")
    target_root = os.path.join(os.getcwd(), "Trez_Marias_Requirements_Documentation.pdf")
    
    shutil.copyfile(pdf_temp_path, target_docs)
    shutil.copyfile(pdf_temp_path, target_root)
    print("SUCCESS")
