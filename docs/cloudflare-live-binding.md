# Cloudflare production service binding

The 2D live viewer calls `/api/byeoli/state`, which expects this Pages service binding:

- Variable name: `BYEOLI_AUTHORITY`
- Target service: `mimesis-byeoli-authority`
- Environment: Production

After adding or restoring the binding, verify:

1. `/api/byeoli/state` returns a schemaVersion 1 envelope instead of `authority_service_binding_missing`.
2. `/byeoli-walk/?mode=live` shows `LIVE · <authorityId> · #<sequence>` and renders Byeoli.

The code cannot create this Cloudflare dashboard binding; it only reports the missing binding clearly and preserves the last valid snapshot during reconnects.