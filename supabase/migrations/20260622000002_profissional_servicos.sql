-- Junction table: profissional_servicos
-- Maps which profissionais can perform which serviços (M:N)

create table if not exists profissional_servicos (
  profissional_id uuid not null references profissionais(id) on delete cascade,
  servico_id      uuid not null references servicos(id) on delete cascade,
  primary key (profissional_id, servico_id)
);

alter table profissional_servicos enable row level security;

create policy "auth_all" on profissional_servicos
  for all to authenticated using (true) with check (true);
