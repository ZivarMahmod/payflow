/**
 * @flowpay/db — public exports.
 *
 * Re-exports the (currently hand-authored) Supabase generated types so
 * consumers import them once: `import type { Database, Restaurant } from '@flowpay/db'`.
 */

export type {
    Database,
    Json,
    Location,
    LocationInsert,
    LocationUpdate,
    Restaurant,
    RestaurantInsert,
    RestaurantUpdate,
    StaffInsert,
    StaffMember,
    StaffUpdate,
    TableInsert,
    TableRow,
    TableUpdate,
} from "./database.types.js";
