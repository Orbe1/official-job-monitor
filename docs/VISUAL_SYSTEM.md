# Visual system

InternJobs uses an editorial-technology visual language: a narrow forest sidebar, warm paper workspace, selective serif display type, functional sans-serif controls, and opportunity information as the primary visual material.

## Typography and surfaces

- `--display` is reserved for the InternJobs wordmark, the Discover heading, company names in the drawer, and a small number of high-level numeric moments.
- `--sans` remains the functional typeface for navigation, roles, filters, metadata, controls, and application state.
- Permanent explanation panels are avoided. Trust labels stay contextual and short: `Official source`, `Discovery listing`, `Found`, and `Checked`.
- Rows use light separators instead of boxed table cells. Direct company logos, role identity, location/work style, compensation, timing, and one primary action form the scan path.

## Shared rows

Discover, Watch, and Tracker rows carry the `.product-row` base hook plus page-specific elements. Shared expectations are:

- direct or fallback company logo at a consistent optical size;
- title or company identity receives the most width;
- metadata is quieter than timing and next actions;
- selected surfaces use a pale company tint and a narrow accent edge;
- hover and focus states do not move content significantly;
- mobile layouts retain location, work style, next action, and stage rather than hiding the task-critical fields.

## Company themes

`src/client/companyTheme.ts` owns the presentation-only theme contract. Known companies receive restrained brand-derived accents. Unknown companies use the fixed InternJobs teal fallback, so unfamiliar brands remain coherent with the product rather than receiving an arbitrary color.

The helper exposes:

```text
--company-accent
--company-accent-strong
--company-accent-border
--company-accent-tint
--company-accent-tint-strong
--company-on-accent
```

Large saturated brand backgrounds are prohibited. Derived tints are mixed toward the warm workspace surface, while `--company-on-accent` chooses readable dark or light foreground text. Theme variables may style selected rows, inspector washes, small edges, and company-primary controls; they do not recolor the global navigation or semantic states. Save/Follow use InternJobs teal, posting availability uses green/red/amber, and application stages keep fixed colors across every company.

## Shared opportunity inspector

Role and company details share one persistent `InspectorDrawer` shell and switch modes in place. It is a full-height, nonmodal right rail only on wide desktop, an overlay at laptop and tablet widths, and a full-screen surface on mobile. The wide rail keeps the underlying list usable so another opportunity can be selected directly. Overlay modes lock background scroll and trap focus. Every mode moves focus into the inspector, restores the original opener on close, supports Escape, resets only the inspector body scroll when modes change, and preserves the underlying page position; overlay modes also support backdrop dismissal.

Role mode prioritizes identity and essential normalized facts, Apply/Save, and a collapsed application tracker; long posting descriptions and requirements remain on the official site. Company mode keeps the inspector to at most three current openings, a compact observed hiring-pattern chart only after a conservative first-party evidence threshold, and one compact official-source row. Insufficient samples show a quiet message instead of a confident chart, and previous-opening lists are not rendered. The history language describes when InternJobs first observed openings and never presents the chart as a posting-date guarantee or prediction.

## Responsive rules

- Wide desktop: forest sidebar, inline primary and secondary Discover filters, four-part opportunity rows, and a nonmodal right-side shared inspector rail.
- Laptop/tablet: compact sidebar rail, secondary filters behind `Filters`, reduced row columns, and overlay details.
- Mobile: sticky utility bar, three-item bottom navigation, stacked opportunity metadata, and a full-screen shared inspector.

All responsive states preserve keyboard targets and accessible names. Motion is limited to short state transitions and is disabled by the existing reduced-motion media query.
