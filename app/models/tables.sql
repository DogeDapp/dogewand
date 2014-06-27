CREATE EXTENSION "uuid-ossp";

CREATE TABLE users (
  user_id serial PRIMARY KEY,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0)
);

CREATE TABLE accounts (
  account_id serial PRIMARY KEY,
  user_id int REFERENCES users,
  uniqid text NOT NULL,
  provider text NOT NULL,
  display_name text NOT NULL,
  UNIQUE (uniqid, provider)
);

CREATE TYPE tip_state AS ENUM ('created', 'claimed', 'canceled');
CREATE TABLE tips (
  tip_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipper_id int NOT NULL REFERENCES accounts,
  tippee_id int NOT NULL REFERENCES accounts,
  amount bigint NOT NULL CHECK (amount > 0),
  state tip_state NOT NULL DEFAULT 'created'
);

CREATE TABLE deposits (
  txid varchar(64) PRIMARY KEY,
  address varchar(34) NOT NULL REFERENCES addresses,
  amount bigint NOT NULL CHECK (amount > 0)
);

CREATE TABLE withdrawals (
  txid varchar(64) PRIMARY KEY,
  user_id int REFERENCES users,
  amount bigint NOT NULL CHECK (amount > 0)
);

CREATE TABLE user_addresses (
  address varchar(34) PRIMARY KEY,
  user_id int REFERENCES users
);
