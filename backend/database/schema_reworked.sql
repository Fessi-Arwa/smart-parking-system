-- ============================================================
-- SMART PARKING - SCHEMA REWORKED
-- Ce script est corrige pour rester coherent avec le backend
-- actuel, tout en ajoutant une vraie table ETAGE.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

create type role_type as enum ('conducteur', 'owner', 'admin');
create type owner_status_type as enum ('en_attente', 'accepte', 'refuse', 'suspendu');
create type parking_status_type as enum ('actif', 'inactif');
create type parking_validation_status_type as enum ('brouillon', 'en_attente_validation', 'valide', 'rejete');
create type parking_setup_status_type as enum ('non_commencee', 'en_cours', 'terminee');
create type ia_setup_status_type as enum ('non_configuree', 'en_cours', 'testee', 'active');
create type place_status_type as enum ('libre', 'occupee', 'reservee');
create type reservation_status_type as enum ('en_attente', 'confirmee', 'annulee', 'terminee');
create type paiement_status_type as enum ('en_attente', 'paye', 'echoue');
create type abonnement_status_type as enum ('actif', 'expire', 'suspendu', 'en_attente');
create type abonnement_type as enum ('mensuel', 'trimestriel', 'annuel');

-- ============================================================
-- COMPTES
-- ============================================================

create table comptes (
    id_compte bigserial primary key,
    nom varchar(150) not null,
    email varchar(255) not null unique,
    mot_passe varchar(255) not null,
    telephone varchar(30),
    role role_type not null,
    owner_status owner_status_type not null default 'en_attente',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- VEHICULE
-- ============================================================

create table vehicule (
    id_veh bigserial primary key,
    conducteur_id bigint not null references comptes(id_compte) on delete cascade,
    matricule varchar(50) not null unique,
    marque varchar(100),
    type varchar(100),
    created_at timestamptz not null default now()
);

-- ============================================================
-- PARKING
-- ============================================================

create table parking (
    id_park bigserial primary key,
    owner_id bigint not null references comptes(id_compte) on delete cascade,
    nom varchar(150) not null,
    adresse text not null,
    ville varchar(100),
    capacite integer not null default 0 check (capacite >= 0),
    prix_heure numeric(10,2) not null default 0 check (prix_heure >= 0),
    statut parking_status_type not null default 'actif',
    validation_status parking_validation_status_type not null default 'brouillon',
    setup_status parking_setup_status_type not null default 'non_commencee',
    ai_setup_status ia_setup_status_type not null default 'non_configuree',
    created_at timestamptz not null default now()
);

-- ============================================================
-- ETAGE
-- ============================================================

create table etage (
    id_etage bigserial primary key,
    parking_id bigint not null references parking(id_park) on delete cascade,
    nom varchar(100) not null,
    code varchar(50),
    ordre integer not null default 0 check (ordre >= 0),
    description text,
    total_places integer not null default 0 check (total_places >= 0),
    created_at timestamptz not null default now(),
    unique (parking_id, nom),
    unique (parking_id, ordre),
    unique (parking_id, code)
);

-- ============================================================
-- PLACE
-- On garde parking_id + num_place + zone + etage texte pour
-- compatibilite avec le frontend actuel, tout en ajoutant etage_id.
-- ============================================================

create table place (
    id_place bigserial primary key,
    parking_id bigint not null references parking(id_park) on delete cascade,
    etage_id bigint references etage(id_etage) on delete set null,
    num_place integer not null,
    etat place_status_type not null default 'libre',
    zone varchar(100),
    etage varchar(50),
    created_at timestamptz not null default now(),
    unique (parking_id, num_place)
);

-- ============================================================
-- RESERVATION
-- ============================================================

create table reservation (
    id_res bigserial primary key,
    conducteur_id bigint not null references comptes(id_compte) on delete cascade,
    vehicule_id bigint references vehicule(id_veh) on delete set null,
    place_id bigint not null references place(id_place) on delete restrict,
    date_debut timestamptz not null,
    date_fin timestamptz not null,
    statut reservation_status_type not null default 'en_attente',
    prix_total numeric(10,2) not null default 0 check (prix_total >= 0),
    created_at timestamptz not null default now(),
    check (date_fin > date_debut)
);

-- ============================================================
-- PAIEMENT
-- ============================================================

create table paiement (
    id_paiement bigserial primary key,
    reservation_id bigint not null unique references reservation(id_res) on delete cascade,
    montant numeric(10,2) not null check (montant >= 0),
    date_paiement timestamptz,
    mode varchar(50),
    statut paiement_status_type not null default 'en_attente',
    created_at timestamptz not null default now()
);

-- ============================================================
-- FEEDBACK
-- ============================================================

create table feedback (
    id_feed bigserial primary key,
    conducteur_id bigint not null references comptes(id_compte) on delete cascade,
    parking_id bigint not null references parking(id_park) on delete cascade,
    note integer not null check (note between 1 and 5),
    commentaire text,
    date_feed date not null default current_date,
    created_at timestamptz not null default now()
);

-- ============================================================
-- ABONNEMENT
-- ============================================================

create table abonnement (
    id_abon bigserial primary key,
    type abonnement_type not null,
    date_debut date not null,
    date_fin date not null,
    tarif numeric(10,2) not null check (tarif >= 0),
    statut abonnement_status_type not null default 'en_attente',
    created_at timestamptz not null default now(),
    check (date_fin > date_debut)
);

create table abonnement_place (
    id_abon bigint primary key references abonnement(id_abon) on delete cascade,
    conducteur_id bigint not null references comptes(id_compte) on delete cascade,
    place_id bigint not null references place(id_place) on delete cascade
);

create table abonnement_app (
    id_abon bigint primary key references abonnement(id_abon) on delete cascade,
    parking_id bigint not null references parking(id_park) on delete cascade
);

-- ============================================================
-- INDEX
-- ============================================================

create index idx_vehicule_conducteur_id on vehicule(conducteur_id);
create index idx_parking_owner_id on parking(owner_id);
create index idx_etage_parking_id on etage(parking_id);
create index idx_place_parking_id on place(parking_id);
create index idx_place_etage_id on place(etage_id);
create index idx_reservation_conducteur_id on reservation(conducteur_id);
create index idx_reservation_place_id on reservation(place_id);
create index idx_reservation_vehicule_id on reservation(vehicule_id);
create index idx_feedback_conducteur_id on feedback(conducteur_id);
create index idx_feedback_parking_id on feedback(parking_id);
create index idx_abonnement_place_conducteur_id on abonnement_place(conducteur_id);
create index idx_abonnement_place_place_id on abonnement_place(place_id);
create index idx_abonnement_app_parking_id on abonnement_app(parking_id);
