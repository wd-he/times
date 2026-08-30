package store

import "times/internal/model"

func (store *Store) ListCategories(_ int64) ([]model.Category, error) {
	rows, err := store.db.Query(`SELECT id, user_id, name, kind, parent_id, created_at, updated_at FROM categories ORDER BY kind, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	categories := make([]model.Category, 0)
	for rows.Next() {
		var category model.Category
		if err := rows.Scan(&category.ID, &category.UserID, &category.Name, &category.Kind, &category.ParentID, &category.CreatedAt, &category.UpdatedAt); err != nil {
			return nil, err
		}
		categories = append(categories, category)
	}
	return categories, rows.Err()
}

func (store *Store) CategoryBelongs(categoryID int64, kind string, parentID *int64) (bool, error) {
	query := "SELECT COUNT(*) FROM categories WHERE id = ? AND kind = ?"
	args := []any{categoryID, kind}
	if parentID == nil {
		query += " AND parent_id IS NULL"
	} else {
		query += " AND parent_id = ?"
		args = append(args, *parentID)
	}
	var count int
	err := store.db.QueryRow(query, args...).Scan(&count)
	return count == 1, err
}

func (store *Store) FindCategory(name, kind string, parentID *int64) (model.Category, error) {
	query := "SELECT id, user_id, name, kind, parent_id, created_at, updated_at FROM categories WHERE kind = ? AND name = ? AND parent_id IS NULL"
	args := []any{kind, name}
	if parentID != nil {
		query = "SELECT id, user_id, name, kind, parent_id, created_at, updated_at FROM categories WHERE kind = ? AND name = ? AND parent_id = ?"
		args = []any{kind, name, *parentID}
	}
	var category model.Category
	err := store.db.QueryRow(query, args...).Scan(&category.ID, &category.UserID, &category.Name, &category.Kind, &category.ParentID, &category.CreatedAt, &category.UpdatedAt)
	return category, err
}

func (store *Store) CreateCategory(userID int64, name, kind string, parentID *int64, now string) (model.Category, error) {
	result, err := store.db.Exec(`INSERT INTO categories(user_id, name, kind, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, userID, name, kind, parentID, now, now)
	if err != nil {
		return model.Category{}, err
	}
	id, err := result.LastInsertId()
	return model.Category{ID: id, UserID: userID, Name: name, Kind: kind, ParentID: parentID, CreatedAt: now, UpdatedAt: now}, err
}

func (store *Store) ListAllCategories() ([]model.AdminCategory, error) {
	rows, err := store.db.Query(`SELECT c.id, c.user_id, c.name, c.kind, c.parent_id, c.created_at, c.updated_at, u.display_name, u.username, COUNT(DISTINCT e.id) FROM categories c JOIN users u ON u.id = c.user_id LEFT JOIN events e ON e.major_category_id = c.id OR e.sub_category_id = c.id GROUP BY c.id, c.user_id, c.name, c.kind, c.parent_id, c.created_at, c.updated_at, u.display_name, u.username ORDER BY c.name, c.kind, u.display_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	categories := make([]model.AdminCategory, 0)
	for rows.Next() {
		var category model.AdminCategory
		var eventCount int
		if err := rows.Scan(&category.ID, &category.UserID, &category.Name, &category.Kind, &category.ParentID, &category.CreatedAt, &category.UpdatedAt, &category.UserDisplayName, &category.UserUsername, &eventCount); err != nil {
			return nil, err
		}
		category.EventCount = eventCount
		categories = append(categories, category)
	}
	return categories, rows.Err()
}

func (store *Store) CategoryExists(id int64) (bool, error) {
	var count int
	err := store.db.QueryRow("SELECT COUNT(*) FROM categories WHERE id = ?", id).Scan(&count)
	return count == 1, err
}

func (store *Store) DeleteCategory(id int64) (bool, error) {
	result, err := store.db.Exec(`DELETE FROM categories WHERE id = ? AND NOT EXISTS (SELECT 1 FROM events WHERE major_category_id = ? OR sub_category_id = ?) AND NOT EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = categories.id)`, id, id, id)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count == 1, err
}

func (store *Store) ClearUnusedCategories() (int, error) {
	tx, err := store.db.Begin()
	if err != nil {
		return 0, err
	}
	rollback := func() {
		_ = tx.Rollback()
	}
	result, err := tx.Exec(`DELETE FROM categories WHERE kind = 'sub' AND NOT EXISTS (SELECT 1 FROM events WHERE sub_category_id = categories.id)`)
	if err != nil {
		rollback()
		return 0, err
	}
	subCount, err := result.RowsAffected()
	if err != nil {
		rollback()
		return 0, err
	}
	result, err = tx.Exec(`DELETE FROM categories WHERE kind = 'major' AND NOT EXISTS (SELECT 1 FROM events WHERE major_category_id = categories.id) AND NOT EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = categories.id)`)
	if err != nil {
		rollback()
		return 0, err
	}
	majorCount, err := result.RowsAffected()
	if err != nil {
		rollback()
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return int(subCount + majorCount), nil
}
