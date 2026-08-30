# Times

Times 是一个基于 token 登录的时间记录应用，用于记录事件耗时，并通过图表查看个人和用户维度的时间投入情况。

项目采用 Go 单体部署：Go 后端提供 API 和静态文件服务，React 前端构建产物会嵌入 Go 二进制文件中。生产环境只需要运行一个二进制文件，不需要单独启动 Node.js 服务。

## 功能概览

- 超级管理员和普通用户两种角色，使用 token 登录，不使用账号密码。
- 超级管理员可以创建、停用、恢复普通用户，并重置管理员或普通用户 token。
- 普通用户可以记录、查看、修改和删除自己的事件。
- 事件包含大类、细分类型、描述、开始时间和完成时间，时间精度到分钟。
- 类别全局共享，任何用户创建的类别都可以被其他用户使用；管理员可以管理未使用类别。
- 支持快捷时间录入、CSV 导入和导出。
- 支持个人统计和管理员用户统计，包含日维度、大类维度和饼图。
- SQLite 数据库启动时自动检查并执行数据库结构迁移。
- 前端资源嵌入生产二进制，支持直接运行、后台运行和停止服务。

## 环境要求

开发和常规构建需要：

- Go
- pnpm
- Node.js

构建 Linux 二进制还需要 Docker。前端依赖统一使用 pnpm，不使用 npm。

## 目录结构

```text
.
├── main.go                  # 程序入口和命令行参数
├── internal/                # Go 后端配置、鉴权、业务、存储和 HTTP 接口
├── frontend/                # React、Umi、Ant Design 前端源码
├── scripts/                 # 开发和构建脚本
├── docs/                    # 需求与技术细分文档
├── data/                    # 默认运行数据，不提交到 Git
└── build/                   # 构建产物，不提交到 Git
```

## 开发环境

在项目根目录执行：

```bash
./scripts/dev.sh
```

开发环境会同时启动 Go 后端和 Umi 前端：

- 前端地址：`http://127.0.0.1:8000`
- 后端地址：`http://127.0.0.1:8080`
- 开发数据：项目根目录下的 `data/`

停止开发环境时，在运行脚本的终端按 `Ctrl+C`。

如果已安装 Task，也可以执行：

```bash
task dev
```

## 构建生产产物

### 构建当前平台

```bash
./scripts/build.sh
```

该命令会依次完成前端依赖安装、前端类型检查、前端构建、Go 测试和 Go 编译，产物为：

```text
build/times
```

该产物适用于当前构建平台。脚本不会指定跨平台构建目标。

### 使用 Docker 构建 Linux 二进制

```bash
./scripts/build-linux.sh
```

该命令使用 Docker 构建无 CGO 依赖的 Linux 生产二进制，产物为：

```text
build/times-linux
```

也可以使用 Task：

```bash
task build
task build:linux
```

## 生产环境启动

### 前台启动

在固定的应用目录中执行：

```bash
./build/times
```

默认监听：

```text
http://127.0.0.1:8080
```

指定端口时使用 `-p`：

```bash
./build/times -p 8090
```

### 后台启动和停止

后台启动不需要使用 `nohup`：

```bash
./build/times -d
```

停止后台服务：

```bash
./build/times -stop
```

默认 PID 文件和日志文件分别为：

```text
data/times.pid
data/times.log
```

`-stop` 需要在启动服务时使用的相同目录和配置下执行，以便找到同一个 PID 文件。

## 首次启动和管理员 token

首次启动时，程序会自动创建 SQLite 数据库、超级管理员和管理员 token。默认 token 文件为：

```text
data/admin.token
```

查看管理员 token：

```bash
cat data/admin.token
```

管理员登录后，可以进入“用户管理”，在管理员自己的用户行点击“重置 token”。重置后旧 token 立即失效，新 token 会同步写入 `data/admin.token`。

管理员创建普通用户后，token 只在弹窗中展示一次。弹窗支持：

- 复制完整 token；
- 修改短横线后的 token 尾缀；
- 复制带 token 参数的首页授权链接。

token 文件和数据库都属于运行数据，不要提交到 Git，也不要通过不安全的方式传递 token。

## 运行数据和配置

默认情况下，以下路径相对于启动命令的当前目录：

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `TIMES_ADDR` | `127.0.0.1:8080` | 监听地址和端口 |
| `TIMES_DB_PATH` | `data/times.db` | SQLite 数据库 |
| `TIMES_ADMIN_TOKEN_PATH` | `data/admin.token` | 管理员 token 文件 |
| `TIMES_LOG_PATH` | `data/times.log` | 后台运行日志 |
| `TIMES_PID_PATH` | `data/times.pid` | 后台运行 PID 文件 |
| `TIMES_TIMEZONE` | `Local` | 应用时区 |

二进制文件可以复制到其他目录运行，但如果不指定这些路径，程序会在新的当前目录下创建新的 `data/`，可能导致看起来像“数据库变多”或管理员 token 不一致。生产环境建议使用绝对路径：

```bash
TIMES_DB_PATH=/srv/times/data/times.db \
TIMES_ADMIN_TOKEN_PATH=/srv/times/data/admin.token \
TIMES_LOG_PATH=/srv/times/data/times.log \
TIMES_PID_PATH=/srv/times/data/times.pid \
TIMES_TIMEZONE=Asia/Shanghai \
./times -p 8080 -d
```

## Docker 运行

构建镜像：

```bash
docker build -t times:latest .
```

启动容器并持久化数据：

```bash
mkdir -p data
docker run -d \
  --name times \
  -p 8080:8080 \
  -e TIMES_TIMEZONE=Asia/Shanghai \
  -v "$(pwd)/data:/data" \
  times:latest
```

访问：

```text
http://127.0.0.1:8080
```

查看日志和停止容器：

```bash
docker logs -f times
docker stop times
```

管理员 token 会保存在宿主机的 `data/admin.token` 中，数据库会保存在宿主机的 `data/times.db` 中。

## 页面入口

- `/login`：token 登录。
- `/events`：事件列表、CSV 导入导出和分组查看。
- `/statistics`：普通用户个人统计。
- `/admin/users`：管理员用户管理和 token 管理。
- `/admin/categories`：管理员类别管理。
- `/admin/statistics`：管理员查看用户统计。

所有前端页面都支持通过首页授权链接中的 `token` 查询参数完成登录，验证成功后会自动移除地址栏中的 token 参数。

## 测试和检查

运行后端测试及前端类型检查：

```bash
task test
```

或者分别执行：

```bash
go test . ./internal/... ./frontend
cd frontend
pnpm exec tsc --noEmit
```

正式构建会自动执行这些检查，并生成可直接部署的嵌入式前端二进制文件。
