-- =====================================================================
-- Wardrobe / Closet Marketplace App: MySQL 8 schema
-- Run in MySQL Workbench or the mysql CLI (the DELIMITER lines below
-- are client commands and won't work through mysql2 in Node).
-- On Railway, connect with the public connection credentials and run
-- this against the default database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reset (makes the script safe to re-run during development)
-- ---------------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;

DROP PROCEDURE IF EXISTS purchase_listing;
DROP VIEW IF EXISTS bottom_of_closet;
DROP VIEW IF EXISTS item_wear_stats;

DROP TABLE IF EXISTS post_saves;
DROP TABLE IF EXISTS post_likes;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS outfit_items;
DROP TABLE IF EXISTS outfits;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS item_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS item_images;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================================
-- USERS
-- =====================================================================
CREATE TABLE users (
    user_id            INT           NOT NULL AUTO_INCREMENT,
    username           VARCHAR(50)   NOT NULL,
    email              VARCHAR(255)  NOT NULL,
    password_hash      VARCHAR(255)  NOT NULL,          -- bcrypt hash, never the raw password
    profile_photo_url  VARCHAR(500)  NULL,
    created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email)
);

-- One row per user (1:1 with users).
CREATE TABLE user_settings (
    user_id               INT           NOT NULL,
    address_line1         VARCHAR(255)  NULL,
    address_line2         VARCHAR(255)  NULL,
    city                  VARCHAR(100)  NULL,
    state                 VARCHAR(100)  NULL,
    postal_code           VARCHAR(20)   NULL,
    country               VARCHAR(100)  NULL,
    auto_list_enabled     BOOLEAN       NOT NULL DEFAULT FALSE,
    auto_list_after_days  INT           NOT NULL DEFAULT 30,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_settings_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT chk_auto_list_days CHECK (auto_list_after_days > 0)
);

-- One-directional following (no mutual-follow requirement).
-- Self-follows are blocked by a trigger instead of a CHECK, because
-- MySQL doesn't allow CHECK constraints on columns with ON DELETE CASCADE.
CREATE TABLE follows (
    follower_id   INT       NOT NULL,
    following_id  INT       NOT NULL,
    created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    KEY idx_follows_following (following_id),
    CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_follows_following FOREIGN KEY (following_id)
        REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE TABLE notifications (
    notification_id    INT           NOT NULL AUTO_INCREMENT,
    user_id            INT           NOT NULL,             -- recipient
    notification_type  VARCHAR(20)   NOT NULL,
    message            VARCHAR(255)  NOT NULL,
    is_read            BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id),
    KEY idx_notifications_user (user_id, is_read, created_at),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT chk_notification_type
        CHECK (notification_type IN ('sale', 'purchase', 'follow', 'like'))
);


-- =====================================================================
-- WARDROBE
-- =====================================================================

-- items.user_id is the CURRENT owner. It changes when an item is bought.
-- Whether an item is for sale is derived from listings (an active listing
-- exists), so there's no separate status column to keep in sync.
CREATE TABLE items (
    item_id         INT            NOT NULL AUTO_INCREMENT,
    user_id         INT            NOT NULL,
    item_name       VARCHAR(100)   NOT NULL,
    brand           VARCHAR(100)   NULL,
    category        VARCHAR(50)    NULL,
    color           VARCHAR(50)    NULL,
    size            VARCHAR(20)    NULL,
    notes           TEXT           NULL,
    purchase_price  DECIMAL(10,2)  NULL,                -- owner's cost; used for cost-per-wear
    acquired_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id),
    KEY idx_items_user (user_id),
    CONSTRAINT fk_items_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT chk_purchase_price CHECK (purchase_price IS NULL OR purchase_price >= 0)
);

CREATE TABLE item_images (
    item_image_id  INT           NOT NULL AUTO_INCREMENT,
    item_id        INT           NOT NULL,
    image_url      VARCHAR(500)  NOT NULL,             -- URL in Cloudinary/S3, not the image itself
    sort_order     INT           NOT NULL DEFAULT 0,   -- 0 = main photo
    PRIMARY KEY (item_image_id),
    KEY idx_item_images_item (item_id, sort_order),
    CONSTRAINT fk_item_images_item FOREIGN KEY (item_id)
        REFERENCES items (item_id) ON DELETE CASCADE
);

CREATE TABLE tags (
    tag_id    INT          NOT NULL AUTO_INCREMENT,
    tag_name  VARCHAR(50)  NOT NULL,
    PRIMARY KEY (tag_id),
    UNIQUE KEY uq_tags_name (tag_name)
);

-- Many-to-many: items <-> tags
CREATE TABLE item_tags (
    item_id  INT  NOT NULL,
    tag_id   INT  NOT NULL,
    PRIMARY KEY (item_id, tag_id),
    KEY idx_item_tags_tag (tag_id),
    CONSTRAINT fk_item_tags_item FOREIGN KEY (item_id)
        REFERENCES items (item_id) ON DELETE CASCADE,
    CONSTRAINT fk_item_tags_tag FOREIGN KEY (tag_id)
        REFERENCES tags (tag_id) ON DELETE CASCADE
);


-- =====================================================================
-- MARKETPLACE
-- Commerce tables use the default RESTRICT on delete, so sales history
-- can't be silently erased. (This also means a user with sales history
-- can't be deleted until their history is handled.)
-- =====================================================================

-- listings.user_id is the seller at the time of listing. It is NOT
-- redundant with items.user_id, because the item's owner changes after a sale.
CREATE TABLE listings (
    listing_id      INT            NOT NULL AUTO_INCREMENT,
    item_id         INT            NOT NULL,
    user_id         INT            NOT NULL,
    price           DECIMAL(10,2)  NOT NULL,
    source          VARCHAR(20)    NOT NULL DEFAULT 'manual',   -- 'manual' or 'auto' (auto-listed from Bottom of the Closet)
    status          VARCHAR(20)    NOT NULL DEFAULT 'active',
    listed_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Equals item_id only while the listing is active, otherwise NULL.
    -- The UNIQUE index on it guarantees at most one ACTIVE listing per item
    -- (MySQL treats NULLs as distinct, so sold/cancelled listings don't collide).
    active_item_id  INT GENERATED ALWAYS AS (IF(status = 'active', item_id, NULL)) VIRTUAL,
    PRIMARY KEY (listing_id),
    UNIQUE KEY uq_one_active_listing_per_item (active_item_id),
    KEY idx_listings_item (item_id),
    KEY idx_listings_user (user_id),
    KEY idx_listings_status (status, listed_at),
    CONSTRAINT fk_listings_item FOREIGN KEY (item_id) REFERENCES items (item_id),
    CONSTRAINT fk_listings_user FOREIGN KEY (user_id) REFERENCES users (user_id),
    CONSTRAINT chk_listing_price  CHECK (price > 0),
    CONSTRAINT chk_listing_source CHECK (source IN ('manual', 'auto')),
    CONSTRAINT chk_listing_status CHECK (status IN ('active', 'sold', 'cancelled'))
);

-- One row per completed purchase. The sale price is listings.price.
CREATE TABLE transactions (
    transaction_id  INT       NOT NULL AUTO_INCREMENT,
    listing_id      INT       NOT NULL,
    buyer_id        INT       NOT NULL,
    seller_id       INT       NOT NULL,
    purchased_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (transaction_id),
    UNIQUE KEY uq_transactions_listing (listing_id),   -- a listing can only be sold once
    KEY idx_transactions_buyer (buyer_id, purchased_at),
    KEY idx_transactions_seller (seller_id, purchased_at),
    CONSTRAINT fk_transactions_listing FOREIGN KEY (listing_id) REFERENCES listings (listing_id),
    CONSTRAINT fk_transactions_buyer   FOREIGN KEY (buyer_id)   REFERENCES users (user_id),
    CONSTRAINT fk_transactions_seller  FOREIGN KEY (seller_id)  REFERENCES users (user_id),
    CONSTRAINT chk_not_self_purchase CHECK (buyer_id <> seller_id)
);


-- =====================================================================
-- OUTFITS & SOCIAL
-- =====================================================================

-- An outfit = one photo, worn on one date, tagged with items.
-- Outfits can exist without being posted (they still count as wears).
CREATE TABLE outfits (
    outfit_id   INT           NOT NULL AUTO_INCREMENT,
    user_id     INT           NOT NULL,
    photo_url   VARCHAR(500)  NOT NULL,
    worn_on     DATE          NOT NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (outfit_id),
    KEY idx_outfits_user_date (user_id, worn_on),
    CONSTRAINT fk_outfits_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE
);

-- Many-to-many: outfits <-> items (the item tags on an outfit photo).
-- A trigger below ensures users only tag items they currently own.
CREATE TABLE outfit_items (
    outfit_id  INT  NOT NULL,
    item_id    INT  NOT NULL,
    PRIMARY KEY (outfit_id, item_id),
    KEY idx_outfit_items_item (item_id),
    CONSTRAINT fk_outfit_items_outfit FOREIGN KEY (outfit_id)
        REFERENCES outfits (outfit_id) ON DELETE CASCADE,
    CONSTRAINT fk_outfit_items_item FOREIGN KEY (item_id)
        REFERENCES items (item_id) ON DELETE CASCADE
);

-- A post shares one outfit. The author comes from outfits.user_id,
-- so posts has no user_id column of its own (avoids a transitive dependency).
CREATE TABLE posts (
    post_id     INT           NOT NULL AUTO_INCREMENT,
    outfit_id   INT           NOT NULL,
    caption     VARCHAR(500)  NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id),
    UNIQUE KEY uq_posts_outfit (outfit_id),           -- an outfit is posted at most once
    KEY idx_posts_created (created_at),
    CONSTRAINT fk_posts_outfit FOREIGN KEY (outfit_id)
        REFERENCES outfits (outfit_id) ON DELETE CASCADE
);

CREATE TABLE post_likes (
    user_id     INT       NOT NULL,
    post_id     INT       NOT NULL,
    created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    KEY idx_post_likes_post (post_id),
    CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id)
        REFERENCES posts (post_id) ON DELETE CASCADE
);

CREATE TABLE post_saves (
    user_id     INT       NOT NULL,
    post_id     INT       NOT NULL,
    created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    KEY idx_post_saves_post (post_id),
    CONSTRAINT fk_post_saves_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_post_saves_post FOREIGN KEY (post_id)
        REFERENCES posts (post_id) ON DELETE CASCADE
);


-- =====================================================================
-- TRIGGERS (business rules a foreign key can't express)
-- =====================================================================
DELIMITER $$

CREATE TRIGGER trg_follows_no_self
BEFORE INSERT ON follows
FOR EACH ROW
BEGIN
    IF NEW.follower_id = NEW.following_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Users cannot follow themselves';
    END IF;
END$$

-- You can only tag an outfit with items you currently own.
CREATE TRIGGER trg_outfit_items_owner
BEFORE INSERT ON outfit_items
FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM outfits o
        JOIN items i ON i.user_id = o.user_id
        WHERE o.outfit_id = NEW.outfit_id
          AND i.item_id = NEW.item_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can only tag items you own';
    END IF;
END$$

-- You can only list items you currently own.
CREATE TRIGGER trg_listings_owner
BEFORE INSERT ON listings
FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM items
        WHERE item_id = NEW.item_id
          AND user_id = NEW.user_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can only list items you own';
    END IF;
END$$

DELIMITER ;


-- =====================================================================
-- VIEWS
-- =====================================================================

-- Wear count, cost-per-wear and days since last worn, per item.
-- Only counts wears by the CURRENT owner since they acquired the item,
-- so a bought item starts fresh for the buyer while the seller's old
-- outfits still show its history.
CREATE VIEW item_wear_stats AS
SELECT
    i.item_id,
    i.user_id,
    i.item_name,
    i.purchase_price,
    COUNT(o.outfit_id)                                           AS wear_count,
    MAX(o.worn_on)                                               AS last_worn_on,
    ROUND(i.purchase_price / NULLIF(COUNT(o.outfit_id), 0), 2)   AS cost_per_wear,
    DATEDIFF(CURDATE(), COALESCE(MAX(o.worn_on), DATE(i.acquired_at))) AS days_since_worn
FROM items i
LEFT JOIN outfit_items oi ON oi.item_id = i.item_id
LEFT JOIN outfits o
       ON o.outfit_id = oi.outfit_id
      AND o.user_id   = i.user_id
      AND o.worn_on  >= DATE(i.acquired_at)
GROUP BY i.item_id, i.user_id, i.item_name, i.purchase_price, i.acquired_at;

-- "Bottom of the Closet": unlisted items for users with auto-listing on,
-- with a countdown until they'd be auto-listed.
CREATE VIEW bottom_of_closet AS
SELECT
    s.item_id,
    s.user_id,
    s.item_name,
    s.last_worn_on,
    s.days_since_worn,
    us.auto_list_after_days,
    GREATEST(us.auto_list_after_days - s.days_since_worn, 0) AS days_until_auto_list
FROM item_wear_stats s
JOIN user_settings us ON us.user_id = s.user_id
WHERE us.auto_list_enabled = TRUE
  AND NOT EXISTS (
        SELECT 1 FROM listings l
        WHERE l.item_id = s.item_id AND l.status = 'active'
  );


-- =====================================================================
-- PURCHASE PROCEDURE
-- Usage from Express:  await pool.query('CALL purchase_listing(?, ?)', [listingId, buyerId]);
-- Errors (e.g. 'Listing is no longer available') come back in err.sqlMessage.
-- =====================================================================
DELIMITER $$

CREATE PROCEDURE purchase_listing(IN p_listing_id INT, IN p_buyer_id INT)
BEGIN
    DECLARE v_item_id    INT;
    DECLARE v_seller_id  INT;
    DECLARE v_price      DECIMAL(10,2);
    DECLARE v_status     VARCHAR(20);
    DECLARE v_item_name  VARCHAR(100);

    -- Any error undoes everything, then passes the error up to the API
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- FOR UPDATE locks the listing row so two simultaneous buyers can't both succeed
    SELECT l.item_id, l.user_id, l.price, l.status
      INTO v_item_id, v_seller_id, v_price, v_status
    FROM listings l
    WHERE l.listing_id = p_listing_id
    FOR UPDATE;

    IF v_item_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listing not found';
    END IF;

    IF v_status <> 'active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Listing is no longer available';
    END IF;

    IF v_seller_id = p_buyer_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot buy your own listing';
    END IF;

    SELECT item_name INTO v_item_name
    FROM items
    WHERE item_id = v_item_id
    FOR UPDATE;

    -- 1. Log the sale
    INSERT INTO transactions (listing_id, buyer_id, seller_id)
    VALUES (p_listing_id, p_buyer_id, v_seller_id);

    -- 2. Close the listing
    UPDATE listings
    SET status = 'sold'
    WHERE listing_id = p_listing_id;

    -- 3. Transfer ownership; the sale price becomes the buyer's cost basis
    UPDATE items
    SET user_id        = p_buyer_id,
        purchase_price = v_price,
        acquired_at    = NOW()
    WHERE item_id = v_item_id;

    -- 4. Notify both sides
    INSERT INTO notifications (user_id, notification_type, message) VALUES
        (v_seller_id, 'sale',     CONCAT('Your ', v_item_name, ' sold for $', v_price)),
        (p_buyer_id,  'purchase', CONCAT('You bought ', v_item_name, ' for $', v_price));

    COMMIT;
END$$

DELIMITER ;


-- =====================================================================
-- HANDY QUERIES FOR THE API (reference, not executed)
-- =====================================================================

-- Following feed
-- SELECT p.post_id, p.caption, p.created_at, o.photo_url, o.user_id, u.username
-- FROM posts p
-- JOIN outfits o  ON o.outfit_id = p.outfit_id
-- JOIN follows f  ON f.following_id = o.user_id
-- JOIN users u    ON u.user_id = o.user_id
-- WHERE f.follower_id = ?
-- ORDER BY p.created_at DESC
-- LIMIT 20;

-- Items tagged in a post
-- SELECT i.item_id, i.item_name, i.user_id AS current_owner_id
-- FROM outfit_items oi JOIN items i ON i.item_id = oi.item_id
-- WHERE oi.outfit_id = ?;

-- Marketplace (active listings, excluding your own)
-- SELECT l.listing_id, l.price, i.item_name, i.size, u.username AS seller
-- FROM listings l
-- JOIN items i ON i.item_id = l.item_id
-- JOIN users u ON u.user_id = l.user_id
-- WHERE l.status = 'active' AND l.user_id <> ?
-- ORDER BY l.listed_at DESC;

-- Stats screen: average cost per wear and items sold this month
-- SELECT ROUND(AVG(cost_per_wear), 2) AS avg_cost_per_wear
-- FROM item_wear_stats WHERE user_id = ? AND cost_per_wear IS NOT NULL;
--
-- SELECT COUNT(*) AS items_sold
-- FROM transactions
-- WHERE seller_id = ?
--   AND purchased_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01');

-- "Follows you" badge
-- SELECT EXISTS (
--   SELECT 1 FROM follows WHERE follower_id = :them AND following_id = :me
-- ) AS follows_you;
