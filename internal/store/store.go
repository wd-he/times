package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"times/internal/model"

	_ "modernc.org/sqlite"
)

const currentSchemaVersion = 2

type Store struct {
	db *sql.DB
}

func Open(databasePath string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(databasePath), 0750); err != nil {
		return nil, fmt.Errorf("创建数据库目录失败：%w", err)
	}
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败：%w", err)
	}
	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (store *Store) Close() error { return store.db.Close() }

func (store *Store) migrate() error {
	for _, pragma := range []string{"PRAGMA foreign_keys = ON", "PRAGMA journal_mode = WAL", "PRAGMA busy_timeout = 5000"} {
		if _, err := store.db.Exec(pragma); err != nil {
			return fmt.Errorf("设置数据库参数失败：%w", err)
		}
	}
	if _, err := store.db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return fmt.Errorf("创建迁移表失败：%w", err)
	}
	var version int
	if err := store.db.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").Scan(&version); err != nil {
		return fmt.Errorf("读取数据库版本失败：%w", err)
	}
	if version < 1 {
		if err := store.migrateV1(); err != nil {
			return err
		}
		version = 1
	}
	if version < 2 {
		if err := store.migrateV2(); err != nil {
			return err
		}
	}
	return nil
}

func (store *Store) migrateV1() error {
	tx, err := store.db.Begin()
	if err != nil {
		return fmt.Errorf("开始数据库迁移失败：%w", err)
	}
	statements := []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin', 'user')), token_hash BLOB NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE UNIQUE INDEX users_single_admin ON users(role) WHERE role = 'admin'`,
		`CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('major', 'sub')), parent_id INTEGER REFERENCES categories(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE INDEX categories_user_idx ON categories(user_id, kind, parent_id)`,
		`CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), major_category_id INTEGER NOT NULL REFERENCES categories(id), sub_category_id INTEGER REFERENCES categories(id), description TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT NOT NULL, duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
		`CREATE INDEX events_user_started_idx ON events(user_id, started_at)`,
		`CREATE INDEX events_user_completed_idx ON events(user_id, completed_at)`,
		`CREATE INDEX events_major_category_idx ON events(major_category_id)`,
		`CREATE INDEX events_sub_category_idx ON events(sub_category_id)`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			tx.Rollback()
			return fmt.Errorf("执行数据库迁移失败：%w", err)
		}
	}
	if _, err := tx.Exec("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 1, time.Now().UTC().Format(time.RFC3339)); err != nil {
		tx.Rollback()
		return fmt.Errorf("记录数据库版本失败：%w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交数据库迁移失败：%w", err)
	}
	return nil
}

func (store *Store) migrateV2() error {
	tx, err := store.db.Begin()
	if err != nil {
		return fmt.Errorf("开始数据库迁移失败：%w", err)
	}
	statements := []string{
		`ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''`,
		`UPDATE users SET username = CASE WHEN role = 'admin' THEN 'admin' ELSE 'user_' || id END, display_name = name WHERE username = ''`,
		`CREATE UNIQUE INDEX users_username_unique ON users(username)`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			tx.Rollback()
			return fmt.Errorf("执行数据库迁移失败：%w", err)
		}
	}
	if _, err := tx.Exec("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", 2, time.Now().UTC().Format(time.RFC3339)); err != nil {
		tx.Rollback()
		return fmt.Errorf("记录数据库版本失败：%w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交数据库迁移失败：%w", err)
	}
	return nil
}

func (store *Store) FindUserByTokenHash(hash []byte) (model.User, error) {
	var user model.User
	var enabled int
	err := store.db.QueryRow(`SELECT id, username, display_name, role, enabled, created_at, updated_at FROM users WHERE token_hash = ?`, hash).Scan(&user.ID, &user.Username, &user.DisplayName, &user.Role, &enabled, &user.CreatedAt, &user.UpdatedAt)
	if err != nil || enabled != 1 {
		return model.User{}, errors.New("用户不存在或已停用")
	}
	user.Enabled = true
	return user, nil
}

func (store *Store) Admin() (model.User, error) {
	var user model.User
	var enabled int
	err := store.db.QueryRow(`SELECT id, username, display_name, role, enabled, created_at, updated_at FROM users WHERE role = 'admin'`).Scan(&user.ID, &user.Username, &user.DisplayName, &user.Role, &enabled, &user.CreatedAt, &user.UpdatedAt)
	user.Enabled = enabled == 1
	return user, err
}

func (store *Store) CreateAdmin(hash []byte, now string) error {
	_, err := store.db.Exec(`INSERT INTO users(name, username, display_name, role, token_hash, enabled, created_at, updated_at) VALUES ('超级管理员', 'admin', '超级管理员', 'admin', ?, 1, ?, ?)`, hash, now, now)
	return err
}

func (store *Store) GetUser(id int64) (model.User, error) {
	var user model.User
	var enabled int
	err := store.db.QueryRow(`SELECT id, username, display_name, role, enabled, created_at, updated_at FROM users WHERE id = ?`, id).Scan(&user.ID, &user.Username, &user.DisplayName, &user.Role, &enabled, &user.CreatedAt, &user.UpdatedAt)
	user.Enabled = enabled == 1
	return user, err
}

func (store *Store) UpdateToken(userID int64, hash []byte, now string) (bool, error) {
	result, err := store.db.Exec("UPDATE users SET token_hash = ?, updated_at = ? WHERE id = ? AND enabled = 1", hash, now, userID)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}

func (store *Store) ListUsers() ([]model.User, error) {
	rows, err := store.db.Query(`SELECT id, username, display_name, role, enabled, created_at, updated_at FROM users ORDER BY role DESC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make([]model.User, 0)
	for rows.Next() {
		var user model.User
		var enabled int
		if err := rows.Scan(&user.ID, &user.Username, &user.DisplayName, &user.Role, &enabled, &user.CreatedAt, &user.UpdatedAt); err != nil {
			return nil, err
		}
		user.Enabled = enabled == 1
		users = append(users, user)
	}
	return users, rows.Err()
}

func (store *Store) UsernameExists(username string) (bool, error) {
	var count int
	err := store.db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&count)
	return count > 0, err
}

func (store *Store) CreateUser(username, displayName string, hash []byte, now string) (model.User, error) {
	result, err := store.db.Exec(`INSERT INTO users(name, username, display_name, role, token_hash, enabled, created_at, updated_at) VALUES (?, ?, ?, 'user', ?, 1, ?, ?)`, displayName, username, displayName, hash, now, now)
	if err != nil {
		return model.User{}, err
	}
	id, err := result.LastInsertId()
	return model.User{ID: id, Username: username, DisplayName: displayName, Role: "user", Enabled: true, CreatedAt: now, UpdatedAt: now}, err
}

func (store *Store) UpdateUser(id int64, displayName *string, enabled *bool, now string) (bool, error) {
	if displayName != nil && enabled != nil {
		result, err := store.db.Exec("UPDATE users SET name = ?, display_name = ?, enabled = ?, updated_at = ? WHERE id = ? AND role = 'user'", *displayName, *displayName, boolInt(*enabled), now, id)
		return affected(result, err)
	}
	if displayName != nil {
		result, err := store.db.Exec("UPDATE users SET name = ?, display_name = ?, updated_at = ? WHERE id = ? AND role = 'user'", *displayName, *displayName, now, id)
		return affected(result, err)
	}
	result, err := store.db.Exec("UPDATE users SET enabled = ?, updated_at = ? WHERE id = ? AND role = 'user'", boolInt(*enabled), now, id)
	return affected(result, err)
}

func (store *Store) DisableToken(id int64, now string) error {
	_, err := store.db.Exec("UPDATE users SET token_hash = ? WHERE id = ?", []byte("disabled-"+fmt.Sprint(id)+"-"+now), id)
	return err
}

func affected(result sql.Result, err error) (bool, error) {
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
