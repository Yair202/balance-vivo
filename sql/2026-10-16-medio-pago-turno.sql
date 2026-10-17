-- Medio de pago del turno (pestaña Administrador de /arqueo): 'nequi' o 'efectivo'.
-- Un turno pagado en efectivo se descuenta del dinero por recoger de ese día.
-- Correr UNA vez en Supabase -> SQL Editor. Es seguro correrlo de nuevo.

alter table arqueos add column if not exists medio_pago_turno text;
