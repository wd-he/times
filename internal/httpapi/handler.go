package httpapi

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"times/internal/model"
	"times/internal/service"
)

type Handler struct {
	service *service.Service
	static  fs.FS
}

var eventCSVHeader = []string{"事件大类", "细分类型", "事件描述", "开始时间", "完成时间"}

func New(application *service.Service, static fs.FS) *Handler {
	return &Handler{service: application, static: static}
}

func (handler *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/login", handler.login)
	mux.HandleFunc("/api/", handler.api)
	mux.HandleFunc("/", handler.staticFile)
	return cors(mux)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func (handler *Handler) login(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		writeError(writer, http.StatusMethodNotAllowed, "method_not_allowed", "不支持该请求方法")
		return
	}
	var input struct {
		Token string `json:"token"`
	}
	if !decodeJSON(writer, request, &input) {
		return
	}
	user, err := handler.service.Authenticate(input.Token)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, "invalid_token", "token 无效或用户已停用")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"user": user})
}

func (handler *Handler) api(writer http.ResponseWriter, request *http.Request) {
	user, err := handler.authenticate(request)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, "unauthorized", "请先使用有效 token 登录")
		return
	}
	name := strings.TrimPrefix(request.URL.Path, "/api/")
	switch {
	case name == "auth/me" && request.Method == http.MethodGet:
		writeJSON(writer, http.StatusOK, map[string]any{"user": user})
	case name == "auth/token/reset" && request.Method == http.MethodPost:
		handler.resetToken(writer, request, user.ID, user.Role == "admin")
	case name == "users" && user.Role == "admin" && request.Method == http.MethodGet:
		handler.listUsers(writer)
	case name == "users" && user.Role == "admin" && request.Method == http.MethodPost:
		handler.createUser(writer, request)
	case strings.HasPrefix(name, "users/") && user.Role == "admin":
		handler.userAction(writer, request, user, strings.TrimPrefix(name, "users/"))
	case name == "categories" && request.Method == http.MethodGet:
		handler.listCategories(writer, user.ID)
	case name == "categories" && user.Role == "user" && request.Method == http.MethodPost:
		handler.createCategory(writer, request, user.ID)
	case name == "admin/categories" && user.Role == "admin" && request.Method == http.MethodGet:
		handler.listAdminCategories(writer)
	case name == "admin/categories/clear-unused" && user.Role == "admin" && request.Method == http.MethodPost:
		handler.clearUnusedCategories(writer)
	case strings.HasPrefix(name, "admin/categories/") && user.Role == "admin" && request.Method == http.MethodDelete:
		handler.deleteAdminCategory(writer, strings.TrimPrefix(name, "admin/categories/"))
	case name == "events" && request.Method == http.MethodGet:
		handler.listEvents(writer, request, user)
	case name == "events" && user.Role == "user" && request.Method == http.MethodPost:
		handler.createEvent(writer, request, user.ID)
	case name == "events/export" && user.Role == "user" && request.Method == http.MethodGet:
		handler.exportEvents(writer, request, user.ID)
	case name == "events/import" && user.Role == "user" && request.Method == http.MethodPost:
		handler.importEvents(writer, request, user.ID)
	case strings.HasPrefix(name, "events/") && user.Role == "user":
		handler.eventAction(writer, request, user.ID, strings.TrimPrefix(name, "events/"))
	case name == "statistics/daily-by-category" && request.Method == http.MethodGet:
		handler.dailyStatistics(writer, request, user)
	case name == "statistics/by-category" && request.Method == http.MethodGet:
		handler.categoryStatistics(writer, request, user)
	case name == "admin/statistics/daily-by-user-category" && user.Role == "admin" && request.Method == http.MethodGet:
		handler.adminStatistics(writer, request)
	default:
		writeError(writer, http.StatusForbidden, "forbidden", "没有权限执行该操作")
	}
}

func (handler *Handler) authenticate(request *http.Request) (model.User, error) {
	value := request.Header.Get("Authorization")
	if !strings.HasPrefix(value, "Bearer ") {
		return model.User{}, service.ErrUnauthorized
	}
	return handler.service.Authenticate(strings.TrimSpace(strings.TrimPrefix(value, "Bearer ")))
}

func (handler *Handler) resetToken(writer http.ResponseWriter, request *http.Request, userID int64, admin bool) {
	var input service.TokenInput
	if !decodeJSON(writer, request, &input) {
		return
	}
	token, err := handler.service.ResetToken(userID, admin, input.TokenSuffix)
	if err != nil {
		writeServiceError(writer, err, "重置 token 失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"token": token})
}

func (handler *Handler) listUsers(writer http.ResponseWriter) {
	users, err := handler.service.ListUsers()
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "users_query_failed", "读取用户失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"users": users})
}

func (handler *Handler) createUser(writer http.ResponseWriter, request *http.Request) {
	var input service.UserInput
	if !decodeJSON(writer, request, &input) {
		return
	}
	user, token, err := handler.service.CreateUser(input)
	if err != nil {
		writeServiceError(writer, err, "创建用户失败")
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"user": user, "token": token})
}

func (handler *Handler) userAction(writer http.ResponseWriter, request *http.Request, actor model.User, suffix string) {
	parts := strings.Split(strings.TrimSuffix(suffix, "/"), "/")
	if len(parts) == 3 && parts[1] == "token" && parts[2] == "reset" && request.Method == http.MethodPost {
		id, err := parseID(parts[0])
		if err != nil {
			writeError(writer, http.StatusBadRequest, "invalid_user_id", "用户 ID 无效")
			return
		}
		if id == actor.ID {
			writeError(writer, http.StatusBadRequest, "invalid_user_id", "请使用当前管理员 token 重置接口")
			return
		}
		handler.resetToken(writer, request, id, false)
		return
	}
	if len(parts) == 1 && request.Method == http.MethodPatch {
		id, err := parseID(parts[0])
		if err != nil {
			writeError(writer, http.StatusBadRequest, "invalid_user_id", "用户 ID 无效")
			return
		}
		if id == actor.ID {
			writeError(writer, http.StatusBadRequest, "admin_immutable", "管理员不能通过用户管理接口停用自己")
			return
		}
		var input service.UserInput
		if !decodeJSON(writer, request, &input) {
			return
		}
		if err := handler.service.UpdateUser(id, input); err != nil {
			writeServiceError(writer, err, "更新用户失败")
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"ok": true})
		return
	}
	writeError(writer, http.StatusNotFound, "not_found", "用户接口不存在")
}

func (handler *Handler) listCategories(writer http.ResponseWriter, userID int64) {
	categories, err := handler.service.Categories(userID)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "categories_query_failed", "读取分类失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"categories": categories})
}

func (handler *Handler) createCategory(writer http.ResponseWriter, request *http.Request, userID int64) {
	var input service.CategoryInput
	if !decodeJSON(writer, request, &input) {
		return
	}
	category, existing, err := handler.service.CreateCategory(userID, input)
	if err != nil {
		writeServiceError(writer, err, "创建分类失败")
		return
	}
	status := http.StatusCreated
	if existing {
		status = http.StatusOK
	}
	writeJSON(writer, status, map[string]any{"category": category, "existing": existing})
}

func (handler *Handler) listAdminCategories(writer http.ResponseWriter) {
	categories, err := handler.service.AdminCategories()
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "categories_query_failed", "读取类别失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"categories": categories})
}

func (handler *Handler) deleteAdminCategory(writer http.ResponseWriter, suffix string) {
	id, err := parseID(strings.TrimSuffix(suffix, "/"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "invalid_category_id", "类别 ID 无效")
		return
	}
	if err := handler.service.DeleteCategory(id); err != nil {
		writeServiceError(writer, err, "删除类别失败")
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func (handler *Handler) clearUnusedCategories(writer http.ResponseWriter) {
	deleted, err := handler.service.ClearUnusedCategories()
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "categories_clear_failed", "清除未使用类别失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"deleted": deleted})
}

func (handler *Handler) listEvents(writer http.ResponseWriter, request *http.Request, actor model.User) {
	userID := actor.ID
	if raw := request.URL.Query().Get("user_id"); raw != "" {
		if actor.Role != "admin" {
			writeError(writer, http.StatusForbidden, "forbidden", "不能查看其他用户事件")
			return
		}
		parsed, err := parseID(raw)
		if err != nil {
			writeError(writer, http.StatusBadRequest, "invalid_user_id", "用户 ID 无效")
			return
		}
		userID = parsed
	}
	events, err := handler.service.Events(userID, request.URL.Query().Get("from"), request.URL.Query().Get("to"))
	if err != nil {
		writeServiceError(writer, err, "读取事件失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"events": events})
}

func (handler *Handler) createEvent(writer http.ResponseWriter, request *http.Request, userID int64) {
	var input service.EventInput
	if !decodeJSON(writer, request, &input) {
		return
	}
	event, err := handler.service.CreateEvent(userID, input)
	if err != nil {
		writeServiceError(writer, err, "创建事件失败")
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"event": event})
}

func (handler *Handler) exportEvents(writer http.ResponseWriter, request *http.Request, userID int64) {
	events, err := handler.service.Events(userID, request.URL.Query().Get("from"), request.URL.Query().Get("to"))
	if err != nil {
		writeServiceError(writer, err, "导出事件失败")
		return
	}
	writer.Header().Set("Content-Type", "text/csv; charset=utf-8")
	writer.Header().Set("Content-Disposition", `attachment; filename="events.csv"`)
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte{0xef, 0xbb, 0xbf})
	csvWriter := csv.NewWriter(writer)
	_ = csvWriter.Write(eventCSVHeader)
	for _, event := range events {
		_ = csvWriter.Write([]string{event.MajorCategory, event.SubCategory, event.Description, formatUTC8(event.StartedAt), formatUTC8(event.CompletedAt)})
	}
	csvWriter.Flush()
}

func formatUTC8(value string) string {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return value
	}
	return parsed.In(time.FixedZone("UTC+8", 8*60*60)).Format("2006-01-02 15:04")
}

func (handler *Handler) importEvents(writer http.ResponseWriter, request *http.Request, userID int64) {
	reader := csv.NewReader(io.LimitReader(request.Body, 10<<20))
	reader.FieldsPerRecord = len(eventCSVHeader)
	header, err := reader.Read()
	if errors.Is(err, io.EOF) {
		writeError(writer, http.StatusBadRequest, "csv_empty", "CSV 文件不能为空")
		return
	}
	if err != nil {
		writeError(writer, http.StatusBadRequest, "csv_invalid", "CSV 文件格式无效")
		return
	}
	header[0] = strings.TrimPrefix(header[0], "\ufeff")
	if !sameStrings(header, eventCSVHeader) {
		writeError(writer, http.StatusBadRequest, "csv_header_invalid", fmt.Sprintf("CSV 表头必须为：%s", strings.Join(eventCSVHeader, "、")))
		return
	}

	inputs := make([]service.ImportEventInput, 0)
	for {
		record, readErr := reader.Read()
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			writeError(writer, http.StatusBadRequest, "csv_invalid", "CSV 文件格式无效")
			return
		}
		inputs = append(inputs, service.ImportEventInput{MajorCategory: record[0], SubCategory: record[1], Description: record[2], StartedAt: record[3], CompletedAt: record[4]})
	}
	if len(inputs) == 0 {
		writeError(writer, http.StatusBadRequest, "csv_empty", "CSV 文件没有事件记录")
		return
	}

	imported, err := handler.service.ImportEvents(userID, inputs)
	if err != nil {
		writeError(writer, http.StatusBadRequest, "csv_import_failed", fmt.Sprintf("导入失败，已新增 %d 条：%v", imported, err))
		return
	}
	writeJSON(writer, http.StatusCreated, map[string]any{"imported": imported})
}

func sameStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func (handler *Handler) eventAction(writer http.ResponseWriter, request *http.Request, userID int64, suffix string) {
	id, err := parseID(strings.TrimSuffix(suffix, "/"))
	if err != nil {
		writeError(writer, http.StatusBadRequest, "invalid_event_id", "事件 ID 无效")
		return
	}
	switch request.Method {
	case http.MethodGet:
		event, getErr := handler.service.Events(userID, "", "")
		if getErr != nil {
			writeServiceError(writer, getErr, "读取事件失败")
			return
		}
		for _, item := range event {
			if item.ID == id {
				writeJSON(writer, http.StatusOK, map[string]any{"event": item})
				return
			}
		}
		writeError(writer, http.StatusNotFound, "event_not_found", "事件不存在")
	case http.MethodPatch:
		var input service.EventInput
		if !decodeJSON(writer, request, &input) {
			return
		}
		item, updateErr := handler.service.UpdateEvent(userID, id, input)
		if updateErr != nil {
			writeServiceError(writer, updateErr, "更新事件失败")
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"event": item})
	case http.MethodDelete:
		if deleteErr := handler.service.DeleteEvent(userID, id); deleteErr != nil {
			writeServiceError(writer, deleteErr, "删除事件失败")
			return
		}
		writer.WriteHeader(http.StatusNoContent)
	default:
		writeError(writer, http.StatusMethodNotAllowed, "method_not_allowed", "不支持该请求方法")
	}
}

func (handler *Handler) dailyStatistics(writer http.ResponseWriter, request *http.Request, actor model.User) {
	userID, err := ownerID(request, actor)
	if err != nil {
		writeServiceError(writer, err, "用户选择无效")
		return
	}
	daily, _, err := handler.service.Statistics(userID, request.URL.Query().Get("from"), request.URL.Query().Get("to"))
	if err != nil {
		writeServiceError(writer, err, "统计查询失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"points": daily})
}

func (handler *Handler) categoryStatistics(writer http.ResponseWriter, request *http.Request, actor model.User) {
	userID, err := ownerID(request, actor)
	if err != nil {
		writeServiceError(writer, err, "用户选择无效")
		return
	}
	_, points, err := handler.service.Statistics(userID, request.URL.Query().Get("from"), request.URL.Query().Get("to"))
	if err != nil {
		writeServiceError(writer, err, "统计查询失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"points": points})
}

func (handler *Handler) adminStatistics(writer http.ResponseWriter, request *http.Request) {
	rawUserIDs := strings.TrimSpace(request.URL.Query().Get("user_id"))
	ids := make([]int64, 0)
	if rawUserIDs != "" {
		values := strings.Split(rawUserIDs, ",")
		ids = make([]int64, 0, len(values))
		for _, value := range values {
			id, err := parseID(strings.TrimSpace(value))
			if err != nil {
				writeError(writer, http.StatusBadRequest, "invalid_user_id", "用户 ID 无效")
				return
			}
			ids = append(ids, id)
		}
	}
	points, err := handler.service.AdminStatistics(ids, request.URL.Query().Get("from"), request.URL.Query().Get("to"))
	if err != nil {
		writeServiceError(writer, err, "统计查询失败")
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"points": points})
}

func ownerID(request *http.Request, actor model.User) (int64, error) {
	raw := request.URL.Query().Get("user_id")
	if raw == "" {
		return actor.ID, nil
	}
	if actor.Role != "admin" {
		return 0, service.ErrForbidden
	}
	return parseID(raw)
}

func parseID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		return 0, service.ErrInvalid
	}
	return id, nil
}

func (handler *Handler) staticFile(writer http.ResponseWriter, request *http.Request) {
	name := strings.TrimPrefix(path.Clean(request.URL.Path), "/")
	if name == "" {
		name = "index.html"
	}
	servedName := name
	data, err := fs.ReadFile(handler.static, name)
	if err != nil {
		servedName = "index.html"
		data, err = fs.ReadFile(handler.static, "index.html")
	}
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "frontend_missing", "前端资源不存在，请先执行构建")
		return
	}
	writer.Header().Set("Content-Type", contentType(servedName))
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(data)
}

func contentType(name string) string {
	switch path.Ext(name) {
	case ".html":
		return "text/html; charset=utf-8"
	case ".js":
		return "text/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	default:
		return "application/octet-stream"
	}
}

func decodeJSON(writer http.ResponseWriter, request *http.Request, destination any) bool {
	request.Body = http.MaxBytesReader(writer, request.Body, 2<<20)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid_json", "请求内容无效")
		return false
	}
	return true
}

func writeServiceError(writer http.ResponseWriter, err error, fallback string) {
	status := http.StatusInternalServerError
	code := "request_failed"
	switch {
	case errors.Is(err, service.ErrInvalid):
		status = http.StatusBadRequest
		code = "invalid_input"
	case errors.Is(err, service.ErrConflict):
		status = http.StatusConflict
		code = "conflict"
	case errors.Is(err, service.ErrNotFound):
		status = http.StatusNotFound
		code = "not_found"
	case errors.Is(err, service.ErrForbidden):
		status = http.StatusForbidden
		code = "forbidden"
	}
	writeError(writer, status, code, errorMessage(err, fallback))
}

func errorMessage(err error, fallback string) string {
	if err == nil {
		return fallback
	}
	if strings.Contains(err.Error(), "：") {
		return err.Error()[strings.Index(err.Error(), "：")+len("："):]
	}
	return fallback
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func writeError(writer http.ResponseWriter, status int, code, message string) {
	writeJSON(writer, status, map[string]string{"code": code, "message": message})
}
