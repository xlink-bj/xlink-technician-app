# XLink Technician App

Purpose:
A new Technician / Field Service application for XLink.

Primary users:
- Technical Engineer / Technician
- Site Supervisor
- Back-office operator with permission differences

Core business flow:

Login
→ Home
→ Work Order List
→ Work Order Detail
→ Customer Contact
→ Appointment
→ On-site Inspection
→ Inspection Form
→ Estimate / Quotation
→ Construction
→ Acceptance

Target platforms:
- MP-WEIXIN
- APP-PLUS / Android
- APP-PLUS / iOS

Architecture direction:
- Vue 3
- uni-app family, final runtime choice pending architecture gate
- TypeScript preferred
- one shared business codebase for Mini Program + App
- existing backend APIs will be reused
- workflow + dynamic-form runtime are first-class capabilities

Important:
This repository is a NEW implementation.
The legacy application is a behavioral/reference implementation, not a source-code dependency.
