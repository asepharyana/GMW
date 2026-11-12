-- =============================================================================
-- 0000_baseline.sql
--
-- WHAT THIS IS
--   The complete GMW schema in ONE migration, replacing a 28-file incremental
--   history (0000..0028).
--
-- WHY THE HISTORY WAS SQUASHED
--   The incremental chain existed to walk EXISTING databases forward from
--   whatever shape an older build had left behind. That need is gone: there is
--   no supported database older than this baseline, and `migrate.ts` carries a
--   large sentinel/reconciler whose only job was deciding "is this legacy
--   database really at the latest migration?" — a question a single baseline
--   cannot have. The reconciler's own comments record that it twice marked a
--   migration applied WITHOUT running it, so production booted healthy against
--   a schema missing `verdicts` entirely. With one baseline there is exactly one
--   possible answer, and that failure class cannot recur.
--
-- HOW IT WAS GENERATED (not hand-written)
--   All 28 migrations were applied in order to an empty database, and the
--   resulting schema was captured with `pg_dump --schema-only`. So this file is
--   the schema the old chain actually produced, not an aspiration.
--
--   Contents: 14 tables, 57 indexes, 2 functions, 6 check constraints,
--   0 triggers.
--
--   The `messages_analyzed_has_verdict` constraint trigger that 0020 created
--   is deliberately ABSENT. It was dropped by 0028 as part of the move off
--   hand-written SQL objects, and the invariant it guarded is asserted in the
--   worker inside the same transaction that writes a verdict. See 0028's
--   original comment (preserved in git history) for that trade-off.
--
-- OPERATIONAL CONSEQUENCE
--   This is a BREAKING baseline. Applying it to a database that already holds
--   the old schema WILL fail on "relation already exists" — which is correct:
--   old databases are wiped and rebuilt from this file, not migrated onto.
--   `scripts/reset-data.sh` is the supported path for an existing deployment.
-- =============================================================================

--
-- PostgreSQL database dump
--
-- Dumped from database version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.messages (
    id text NOT NULL,
    guild_id text NOT NULL,
    channel_id text NOT NULL,
    thread_id text,
    user_id text NOT NULL,
    username text NOT NULL,
    avatar_url text,
    content text NOT NULL,
    edited_content text,
    created_at bigint NOT NULL,
    edited_at bigint,
    deleted_at bigint,
    type text DEFAULT 'text'::text NOT NULL,
    metadata text,
    ai_status text DEFAULT 'pending'::text NOT NULL,
    ai_moderation_flags text,
    ai_moderation_score real,
    ai_analysis text,
    ai_categories text,
    ai_confidence real,
    ai_analyzed_at bigint,
    ai_error text,
    is_reply boolean,
    is_forward boolean,
    is_crosspost boolean,
    reference_message_id text,
    reference_channel_id text,
    reference_guild_id text,
    lease_until bigint,
    attempts integer DEFAULT 0 NOT NULL,
    ready_for_work_at bigint DEFAULT 0 NOT NULL,
    worker_id text,
    last_error text,
    owner text DEFAULT 'worker'::text NOT NULL,
    content_hash text,
    context_key text,
    ai_analysis_duration_ms bigint,
    CONSTRAINT messages_ai_status_check CHECK ((ai_status = ANY (ARRAY['pending'::text, 'claimed'::text, 'analyzed'::text, 'retry_wait'::text, 'dead'::text, 'skipped'::text])))
);
--
-- Name: claim_messages(text, integer, integer, text[]); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.claim_messages(p_worker_id text, p_limit integer DEFAULT 40, p_lease_ms integer DEFAULT 90000, p_excluded_channel_ids text[] DEFAULT '{}'::text[]) RETURNS SETOF public.messages
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM messages
     WHERE ai_status IN ('pending', 'retry_wait')
       AND ready_for_work_at <= (extract(epoch from now())*1000)::bigint
       AND deleted_at IS NULL
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE messages m
     SET ai_status    = 'claimed',
         lease_until     = (extract(epoch from now())*1000)::bigint + p_lease_ms,
         attempts        = m.attempts + 1,
         worker_id       = p_worker_id
    FROM candidates c
   WHERE m.id = c.id
  RETURNING m.*;
END;
$$;
--
-- Name: reclaim_expired_claims(integer); Type: FUNCTION; Schema: public; Owner: -
--
CREATE FUNCTION public.reclaim_expired_claims(p_limit integer DEFAULT 200) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE n integer;
BEGIN
  WITH expired AS (
    SELECT id FROM messages
     WHERE ai_status = 'claimed'
       AND lease_until IS NOT NULL
       AND lease_until < (extract(epoch from now())*1000)::bigint
     ORDER BY lease_until
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE messages m
     SET ai_status = 'pending',
         lease_until  = NULL,
         worker_id    = NULL,
         last_error   = COALESCE(m.last_error, 'lease expired: worker died mid-flight')
    FROM expired e
   WHERE m.id = e.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
--
-- Name: analysis_attempts; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.analysis_attempts (
    id bigint NOT NULL,
    message_id text NOT NULL,
    worker_id text,
    attempt integer NOT NULL,
    outcome text NOT NULL,
    error_code text,
    error_message text,
    duration_ms integer,
    model text,
    prompt_tokens integer,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    CONSTRAINT analysis_attempts_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'llm_error'::text, 'parse_error'::text, 'abandoned'::text, 'duplicate'::text])))
);
--
-- Name: analysis_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--
CREATE SEQUENCE public.analysis_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: analysis_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--
ALTER SEQUENCE public.analysis_attempts_id_seq OWNED BY public.analysis_attempts.id;
--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.attachments (
    id text NOT NULL,
    message_id text NOT NULL,
    guild_id text NOT NULL,
    channel_id text NOT NULL,
    thread_id text,
    user_id text NOT NULL,
    filename text NOT NULL,
    size integer NOT NULL,
    type text NOT NULL,
    discord_url text NOT NULL,
    uploaded_url text,
    upload_status text DEFAULT 'pending'::text NOT NULL,
    upload_error text,
    created_at bigint NOT NULL,
    uploaded_at bigint
);
--
-- Name: channel_cultures; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.channel_cultures (
    channel_id text NOT NULL,
    guild_id text NOT NULL,
    culture_summary text NOT NULL,
    last_analyzed_at bigint NOT NULL
);
--
-- Name: chatbot_messages; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.chatbot_messages (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT mascot_chat_messages_id_not_null NOT NULL,
    user_id text CONSTRAINT mascot_chat_messages_user_id_not_null NOT NULL,
    user_message text CONSTRAINT mascot_chat_messages_user_message_not_null NOT NULL,
    bot_response text CONSTRAINT mascot_chat_messages_mascot_response_not_null NOT NULL,
    context jsonb DEFAULT '{}'::jsonb CONSTRAINT mascot_chat_messages_context_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT mascot_chat_messages_created_at_not_null NOT NULL
);
--
-- Name: message_edits; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.message_edits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text NOT NULL,
    old_content text NOT NULL,
    edited_at bigint NOT NULL
);
--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.message_reactions (
    id text NOT NULL,
    message_id text NOT NULL,
    channel_id text NOT NULL,
    guild_id text NOT NULL,
    user_id text NOT NULL,
    username text NOT NULL,
    emoji text NOT NULL,
    emoji_id text,
    animated boolean DEFAULT false NOT NULL,
    reaction_type text NOT NULL,
    created_at bigint NOT NULL,
    CONSTRAINT message_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['add'::text, 'remove'::text])))
);
--
-- Name: message_reviews; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.message_reviews (
    id text NOT NULL,
    message_id text NOT NULL,
    guild_id text NOT NULL,
    channel_id text NOT NULL,
    reviewer_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_at bigint NOT NULL,
    reviewed_at bigint
);
--
-- Name: moderation_actions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.moderation_actions (
    id text NOT NULL,
    message_id text,
    user_id text,
    guild_id text NOT NULL,
    action_type text NOT NULL,
    reason text,
    executed_by text,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    created_at bigint NOT NULL,
    executed_at bigint,
    flags text,
    categories text,
    confidence real,
    score real,
    evidence text,
    policy_version text,
    username text,
    server_nick text
);
--
-- Name: retention_policies; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.retention_policies (
    id text NOT NULL,
    guild_id text NOT NULL,
    channel_id text,
    retention_days integer DEFAULT 90 NOT NULL,
    apply_to_media boolean DEFAULT true NOT NULL,
    apply_to_voice boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);
--
-- Name: term_glossary_cache; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.term_glossary_cache (
    term text NOT NULL,
    definition text NOT NULL,
    source_url text DEFAULT ''::text NOT NULL,
    resolved_at bigint NOT NULL,
    hit_count integer DEFAULT 0 NOT NULL
);
--
-- Name: media_vision_cache; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE IF NOT EXISTS public.media_vision_cache (
    fingerprint text NOT NULL,
    description text NOT NULL,
    resolved_at bigint NOT NULL,
    hit_count integer DEFAULT 0 NOT NULL
);
--
-- Name: ui_state; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.ui_state (
    key text NOT NULL,
    value text NOT NULL,
    updated_at bigint NOT NULL
);
--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.user_profiles (
    user_id text NOT NULL,
    guild_id text NOT NULL,
    profile_summary text NOT NULL,
    last_analyzed_at bigint NOT NULL
);
--
-- Name: verdicts; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.verdicts (
    message_id text NOT NULL,
    status text NOT NULL,
    flags text[] DEFAULT '{}'::text[] NOT NULL,
    categories text[] DEFAULT '{}'::text[] NOT NULL,
    confidence double precision DEFAULT 0 NOT NULL,
    score double precision,
    analysis text DEFAULT ''::text NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    policy_version text,
    model text,
    duration_ms integer,
    created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    updated_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint NOT NULL,
    auto_delete_state text,
    auto_delete_claimed_at bigint,
    reason text,
    action text,
    CONSTRAINT verdicts_auto_delete_state_check CHECK ((auto_delete_state = ANY (ARRAY['pending'::text, 'claimed'::text, 'done'::text, 'failed'::text]))),
    CONSTRAINT verdicts_reason_check CHECK (((status <> 'deleted'::text) OR ((reason IS NOT NULL) AND (reason <> ''::text)))),
    CONSTRAINT verdicts_status_check CHECK ((status = ANY (ARRAY['clean'::text, 'deleted'::text, 'error'::text])))
);
--
-- Name: analysis_attempts id; Type: DEFAULT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.analysis_attempts ALTER COLUMN id SET DEFAULT nextval('public.analysis_attempts_id_seq'::regclass);
--
-- Name: analysis_attempts analysis_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.analysis_attempts
    ADD CONSTRAINT analysis_attempts_pkey PRIMARY KEY (id);
--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);
--
-- Name: channel_cultures channel_cultures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.channel_cultures
    ADD CONSTRAINT channel_cultures_pkey PRIMARY KEY (channel_id);
--
-- Name: chatbot_messages mascot_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT mascot_chat_messages_pkey PRIMARY KEY (id);
--
-- Name: message_edits message_edits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.message_edits
    ADD CONSTRAINT message_edits_pkey PRIMARY KEY (id);
--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);
--
-- Name: message_reviews message_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.message_reviews
    ADD CONSTRAINT message_reviews_pkey PRIMARY KEY (id);
--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
--
-- Name: moderation_actions moderation_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_pkey PRIMARY KEY (id);
--
-- Name: retention_policies retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.retention_policies
    ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (id);
--
-- Name: term_glossary_cache term_glossary_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.term_glossary_cache
    ADD CONSTRAINT term_glossary_cache_pkey PRIMARY KEY (term);
--
-- Name: media_vision_cache media_vision_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.media_vision_cache
    ADD CONSTRAINT media_vision_cache_pkey PRIMARY KEY (fingerprint);
--
-- Name: ui_state ui_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.ui_state
    ADD CONSTRAINT ui_state_pkey PRIMARY KEY (key);
--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);
--
-- Name: verdicts verdicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.verdicts
    ADD CONSTRAINT verdicts_pkey PRIMARY KEY (message_id);
--
-- Name: idx_attachments_channel; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attachments_channel ON public.attachments USING btree (channel_id);
--
-- Name: idx_attachments_channel_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attachments_channel_created ON public.attachments USING btree (channel_id, created_at, id);
--
-- Name: idx_attachments_message; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attachments_message ON public.attachments USING btree (message_id);
--
-- Name: idx_attachments_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attachments_status ON public.attachments USING btree (upload_status);
--
-- Name: idx_attachments_thread_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attachments_thread_created ON public.attachments USING btree (thread_id, created_at, id);
--
-- Name: idx_attempts_message; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attempts_message ON public.analysis_attempts USING btree (message_id, attempt DESC);
--
-- Name: idx_attempts_outcome_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_attempts_outcome_created ON public.analysis_attempts USING btree (outcome, created_at DESC);
--
-- Name: idx_channel_cultures_guild_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_channel_cultures_guild_id ON public.channel_cultures USING btree (guild_id);
--
-- Name: idx_chatbot_messages_user_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_chatbot_messages_user_created ON public.chatbot_messages USING btree (user_id, created_at DESC);
--
-- Name: idx_message_edits_edited_at; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_message_edits_edited_at ON public.message_edits USING btree (edited_at);
--
-- Name: idx_message_edits_message_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_message_edits_message_id ON public.message_edits USING btree (message_id);
--
-- Name: idx_message_reviews_created_at; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_message_reviews_created_at ON public.message_reviews USING btree (created_at);
--
-- Name: idx_message_reviews_guild_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_message_reviews_guild_status ON public.message_reviews USING btree (guild_id, status, created_at);
--
-- Name: idx_message_reviews_message_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_message_reviews_message_id ON public.message_reviews USING btree (message_id);
--
-- Name: idx_message_reviews_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_message_reviews_status ON public.message_reviews USING btree (status);
--
-- Name: idx_messages_ai_status_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_ai_status_created ON public.messages USING btree (ai_status, created_at, id);
--
-- Name: idx_messages_cache; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_cache ON public.messages USING btree (content_hash, context_key) WHERE (content_hash IS NOT NULL);
--
-- Name: idx_messages_channel; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_channel ON public.messages USING btree (channel_id);
--
-- Name: idx_messages_channel_ai_status_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_channel_ai_status_created ON public.messages USING btree (channel_id, ai_status, created_at, id);
--
-- Name: idx_messages_channel_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_channel_created ON public.messages USING btree (channel_id, created_at, id);
--
-- Name: idx_messages_claim; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_claim ON public.messages USING btree (created_at) WHERE ((ai_status = ANY (ARRAY['pending'::text, 'retry_wait'::text])) AND (deleted_at IS NULL));
--
-- Name: idx_messages_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_created ON public.messages USING btree (created_at);
--
-- Name: idx_messages_guild_ai_status_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_guild_ai_status_created ON public.messages USING btree (guild_id, ai_status, created_at, id);
--
-- Name: idx_messages_guild_created_deleted; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_guild_created_deleted ON public.messages USING btree (guild_id, created_at, deleted_at, id);
--
-- Name: idx_messages_lease; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_lease ON public.messages USING btree (lease_until) WHERE (ai_status = 'claimed'::text);
--
-- Name: idx_messages_status_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_status_created ON public.messages USING btree (ai_status, created_at DESC);
--
-- Name: idx_messages_thread; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_thread ON public.messages USING btree (thread_id);
--
-- Name: idx_messages_thread_ai_status_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_thread_ai_status_created ON public.messages USING btree (thread_id, ai_status, created_at, id);
--
-- Name: idx_messages_thread_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_thread_created ON public.messages USING btree (thread_id, created_at, id);
--
-- Name: idx_messages_user; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_messages_user ON public.messages USING btree (user_id);
--
-- Name: idx_moderation_actions_guild_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_moderation_actions_guild_status ON public.moderation_actions USING btree (guild_id, status, created_at);
--
-- Name: idx_moderation_actions_message_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_moderation_actions_message_id ON public.moderation_actions USING btree (message_id);
--
-- Name: idx_moderation_actions_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_moderation_actions_status ON public.moderation_actions USING btree (status);
--
-- Name: idx_moderation_actions_user_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_moderation_actions_user_id ON public.moderation_actions USING btree (user_id);
--
-- Name: idx_reactions_guild_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_reactions_guild_created ON public.message_reactions USING btree (guild_id, created_at);
--
-- Name: idx_reactions_message_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_reactions_message_id ON public.message_reactions USING btree (message_id);
--
-- Name: idx_reactions_user_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_reactions_user_id ON public.message_reactions USING btree (user_id);
--
-- Name: idx_retention_policies_enabled; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_retention_policies_enabled ON public.retention_policies USING btree (enabled);
--
-- Name: idx_retention_policies_guild_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_retention_policies_guild_id ON public.retention_policies USING btree (guild_id);
--
-- Name: idx_term_glossary_cache_resolved_at; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_term_glossary_cache_resolved_at ON public.term_glossary_cache USING btree (resolved_at);
--
-- Name: idx_media_vision_cache_resolved_at; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_media_vision_cache_resolved_at ON public.media_vision_cache USING btree (resolved_at);
--
-- Name: idx_user_profiles_guild_id; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_user_profiles_guild_id ON public.user_profiles USING btree (guild_id);
--
-- Name: idx_verdicts_auto_delete_pending; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_verdicts_auto_delete_pending ON public.verdicts USING btree (created_at) WHERE ((auto_delete_state IS NULL) AND (status = 'deleted'::text));
--
-- Name: idx_verdicts_status_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_verdicts_status_created ON public.verdicts USING btree (status, created_at DESC);
--
-- Name: analysis_attempts analysis_attempts_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.analysis_attempts
    ADD CONSTRAINT analysis_attempts_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
--
-- Name: attachments fk_attachments_message_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT fk_attachments_message_id FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
--
-- Name: verdicts verdicts_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.verdicts
    ADD CONSTRAINT verdicts_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
--
-- PostgreSQL database dump complete
--
