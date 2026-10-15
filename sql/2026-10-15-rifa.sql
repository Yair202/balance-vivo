-- Rifa para clientes (/rifa). Correr UNA vez en Supabase -> SQL Editor.
-- Es seguro correrlo de nuevo.

create table if not exists rifa_registros (
  id bigserial primary key,
  factura text not null unique,              -- Ref. venta del POS (ej. POS0000010959)
  monto numeric not null,                    -- total de la factura según Odoo
  fecha_compra date,
  nombre text not null,
  celular text not null,
  nino_nombre text,
  nino_cumple date,
  autoriza_marketing boolean not null default false,  -- casilla de promociones por WhatsApp
  autoriza_marketing_en timestamptz,                  -- prueba de cuándo autorizó
  acepta_reglamento boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists rifa_boletas (
  numero int primary key,                    -- llave: un número nunca se repite
  registro_id bigint not null references rifa_registros(id) on delete cascade,
  creado_en timestamptz not null default now()
);
create index if not exists rifa_boletas_registro on rifa_boletas(registro_id);

alter table rifa_registros enable row level security;  -- solo la llave secreta (servidor)
alter table rifa_boletas enable row level security;
grant select, insert, update, delete on table public.rifa_registros to service_role;
grant select, insert, update, delete on table public.rifa_boletas to service_role;
grant usage, select on sequence public.rifa_registros_id_seq to service_role;
