-- Sirkuit ketiga: Apex Circuit, trek teknikal dengan S-curve dan hairpin.
--
-- Bentuknya hidup di `lib/track-layout.ts`; migrasi ini hanya melebarkan CHECK
-- supaya kolomnya boleh menyimpan indeksnya. Additive dan idempoten: pemain yang
-- sudah ada tetap di sirkuit 0 atau 1 dan tidak tersentuh.
ALTER TABLE racely_players DROP CONSTRAINT IF EXISTS racely_players_circuit_check;
ALTER TABLE racely_players ADD CONSTRAINT racely_players_circuit_check
  CHECK (circuit IN (0, 1, 2));
