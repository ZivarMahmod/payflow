-- 010_google_place_id.sql — restaurants.google_place_id
-- BRIEF-API-006
--
-- Adds the single column needed for the Google review deep link.
-- Nothing else. Keeping the migration minimal makes the rollback
-- story obvious: drop the column, remove the comment.
--
-- Context:
--   * We never post reviews on the guest's behalf (violates Google TOS).
--   * We redirect the guest to
--       https://search.google.com/local/writereview?placeid=<place_id>
--     which is Google's own landing page for leaving a review on a
--     specific Business Profile.
--   * Restaurants enter their place_id via admin settings. Until they
--     do, `google_place_id` is null and the API-006 route falls back to
--     `redirect_url: null` (graceful — the review is still recorded).
--
-- Validation:
--   * We do NOT enforce format. Google place IDs are opaque strings
--     (20-30 chars, letters/digits/hyphen/underscore) but Google has
--     reshaped the format before. A sanity check "looks like a place id"
--     can live in the admin app.
--   * A simple length bound (<= 255) catches pathological pastes
--     without constraining the future format.

alter table public.restaurants
    add column if not exists google_place_id text;

-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`; guard with a DO-block so
-- the migration is idempotent across re-runs.
do $$
begin
    if not exists (
        select 1
            from pg_constraint
            where conname  = 'restaurants_google_place_id_len'
              and conrelid = 'public.restaurants'::regclass
    ) then
        alter table public.restaurants
            add constraint restaurants_google_place_id_len
            check (google_place_id is null or char_length(google_place_id) between 1 and 255);
    end if;
end
$$;

comment on column public.restaurants.google_place_id is
    'Google Business Profile place_id. Used to construct the review redirect URL for BRIEF-API-006. Null until the restaurant configures it.';
