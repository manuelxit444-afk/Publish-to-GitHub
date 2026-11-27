-- NexoTech V1.0 Beta. Execute uma única vez em um projeto Supabase NOVO.
-- Não use em banco existente sem revisão. A criação do administrador é feita separadamente.
begin;
create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 60));
create unique index categories_name_unique on public.categories(lower(trim(name)));
create table public.products (id uuid primary key default gen_random_uuid(), category_id uuid not null references public.categories(id), name text not null check(length(trim(name)) between 1 and 120), description text not null default '' check(length(description)<=2000), price_cents integer not null check(price_cents between 1 and 10000000), stock integer not null default 0 check(stock between 0 and 100000), image_url text not null default '' check(image_url='' or (image_url like 'https://%' and length(image_url)<=2048)), art text not null default '' check(art in ('','teclado','mouse','ssd','hub')), active boolean not null default false);
create table public.orders (id uuid primary key, user_id uuid not null references auth.users(id), customer text not null check(length(trim(customer)) between 1 and 100), phone text not null check(length(phone) between 8 and 22), delivery text not null check(delivery in ('Combinar entrega em Manaus','Combinar retirada')), status text not null default 'pending' check(status in ('pending','confirmed','completed','canceled')), total_cents bigint not null default 0 check(total_cents>=0), created_at timestamptz not null default now());
create table public.order_items (order_id uuid not null references public.orders(id) on delete cascade, product_id uuid not null references public.products(id), name text not null, quantity integer not null check(quantity between 1 and 99), price_cents integer not null check(price_cents>0), primary key(order_id,product_id));
create index orders_user_idx on public.orders(user_id,created_at desc);
alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.admins,public.categories,public.products,public.orders,public.order_items from public,anon,authenticated;
grant select on public.categories,public.products to anon,authenticated;
grant insert,update on public.categories,public.products to authenticated;
grant select on public.orders,public.order_items to authenticated;
-- O papel administrador não é controlado pelo navegador nem pelo cadastro do cliente.
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.admins where user_id=auth.uid()) $$;
revoke all on function public.is_admin() from public,anon,authenticated;
grant execute on function public.is_admin() to authenticated;
create policy categories_read on public.categories for select to anon,authenticated using(true);
create policy categories_add on public.categories for insert to authenticated with check(public.is_admin());
create policy categories_edit on public.categories for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy products_public on public.products for select to anon,authenticated using(active);
create policy products_admin_read on public.products for select to authenticated using(public.is_admin());
create policy products_add on public.products for insert to authenticated with check(public.is_admin());
create policy products_edit on public.products for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy order_read on public.orders for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and (o.user_id=auth.uid() or public.is_admin())));
-- Solicitação: preços são buscados no banco, não aceitos do navegador. Não reserva estoque.
create function public.create_order(p_id uuid,p_items jsonb,p_customer text,p_phone text,p_delivery text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); item record; p public.products%rowtype; total bigint:=0;
begin
 if uid is null or p_id is null then raise exception 'Entre na sua conta.'; end if;
 if exists(select 1 from public.orders where id=p_id and user_id=uid) then return p_id; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Carrinho inválido.'; end if;
 if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Carrinho inválido.'; end if;
 if p_customer is null or length(trim(p_customer)) not between 1 and 100 or p_phone is null or p_phone !~ '^[0-9+(). -]{8,22}$' or p_delivery is null or p_delivery not in ('Combinar entrega em Manaus','Combinar retirada') then raise exception 'Dados de contato inválidos.'; end if;
 insert into public.orders(id,user_id,customer,phone,delivery) values(p_id,uid,trim(p_customer),trim(p_phone),p_delivery) on conflict(id) do nothing;
 if not found then if exists(select 1 from public.orders where id=p_id and user_id=uid) then return p_id; end if; raise exception 'Pedido inválido.'; end if;
 for item in select x.product_id,x.quantity from jsonb_to_recordset(p_items) as x(product_id uuid,quantity integer) order by x.product_id loop
  select * into p from public.products where id=item.product_id for share;
  if not found or not p.active or item.quantity is null or item.quantity not between 1 and 99 or item.quantity>p.stock then raise exception 'Produto ou quantidade indisponível.'; end if;
  insert into public.order_items(order_id,product_id,name,quantity,price_cents) values(p_id,p.id,p.name,item.quantity,p.price_cents);
  total:=total+(p.price_cents::bigint*item.quantity);
 end loop;
 update public.orders set total_cents=total where id=p_id;
 return p_id;
end $$;
revoke all on function public.create_order(uuid,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.create_order(uuid,jsonb,text,text,text) to authenticated;
-- Confirmação administrativa: desconto atômico do estoque; cancelamento de confirmado repõe.
create function public.change_order_status(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare old_status text; item record;
begin
 if not public.is_admin() then raise exception 'Acesso restrito.'; end if;
 select status into old_status from public.orders where id=p_id for update;
 if not found or p_status is null or not ((old_status='pending' and p_status in ('confirmed','canceled')) or (old_status='confirmed' and p_status in ('completed','canceled'))) then raise exception 'Transição inválida.'; end if;
 if old_status='pending' and p_status='confirmed' then
  for item in select product_id,quantity from public.order_items where order_id=p_id order by product_id loop
   update public.products set stock=stock-item.quantity where id=item.product_id and active and stock>=item.quantity;
   if not found then raise exception 'Estoque insuficiente para confirmar.'; end if;
  end loop;
 elsif old_status='confirmed' and p_status='canceled' then
  for item in select product_id,quantity from public.order_items where order_id=p_id order by product_id loop
   update public.products set stock=stock+item.quantity where id=item.product_id;
  end loop;
 end if;
 update public.orders set status=p_status where id=p_id;
end $$;
revoke all on function public.change_order_status(uuid,text) from public,anon,authenticated;
grant execute on function public.change_order_status(uuid,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',true,2097152,array['image/jpeg','image/png','image/webp']);
create policy nexo_images_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.is_admin());
-- Imagens são públicas para a vitrine; não armazene documentos pessoais neste bucket.
insert into public.categories(name) values('Periféricos'),('Hardware'),('Acessórios');
commit;
-- Sem produtos de demonstração no banco real. Cadastre pelo painel.
