-- Recolección de dinero + pago de turnos (pestaña Administrador de /arqueo).
-- Correr UNA vez en Supabase -> SQL Editor. Es seguro correrlo de nuevo.

alter table arqueos add column if not exists base numeric;                 -- base que se deja en caja
alter table arqueos add column if not exists recogido boolean not null default false;
alter table arqueos add column if not exists recogido_en timestamptz;
alter table arqueos add column if not exists valor_turno numeric;          -- null = usar tarifa del día
alter table arqueos add column if not exists turno_pagado boolean not null default false;
alter table arqueos add column if not exists turno_pagado_en timestamptz;

create table if not exists ajustes (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz default now()
);
alter table ajustes enable row level security;  -- solo la llave secreta (servidor) la lee/escribe

-- 2026-10-11 (2): comisión y adicional del turno
alter table arqueos add column if not exists adicional_turno numeric not null default 0;
alter table arqueos add column if not exists comision_turno numeric;  -- se fija al pagar el turno
grant select, insert, update, delete on table public.ajustes to service_role;
