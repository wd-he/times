package daemon

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func Start(executable string, args []string, logPath string, pidPath string) (int, error) {
	if err := os.MkdirAll(filepath.Dir(logPath), 0700); err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(pidPath), 0700); err != nil {
		return 0, err
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return 0, err
	}
	devNull, err := os.Open(os.DevNull)
	if err != nil {
		logFile.Close()
		return 0, err
	}
	command := exec.Command(executable, args...)
	command.Stdin = devNull
	command.Stdout = logFile
	command.Stderr = logFile
	if err := configure(command); err != nil {
		devNull.Close()
		logFile.Close()
		return 0, err
	}
	if err := command.Start(); err != nil {
		devNull.Close()
		logFile.Close()
		return 0, err
	}
	pid := command.Process.Pid
	if err := writePID(pidPath, pid); err != nil {
		_ = command.Process.Kill()
		_ = command.Process.Release()
		devNull.Close()
		logFile.Close()
		return 0, err
	}
	devNull.Close()
	logFile.Close()
	if err := command.Process.Release(); err != nil {
		_ = os.Remove(pidPath)
		return 0, err
	}
	return pid, nil
}

func Stop(pidPath string) error {
	data, err := os.ReadFile(pidPath)
	if err != nil {
		return fmt.Errorf("读取 PID 文件失败：%w", err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil || pid <= 0 {
		return fmt.Errorf("PID 文件内容无效")
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("查找后台进程失败：%w", err)
	}
	if err := process.Kill(); err != nil {
		return fmt.Errorf("结束后台进程失败：%w", err)
	}
	return os.Remove(pidPath)
}

func writePID(pidPath string, pid int) error {
	return os.WriteFile(pidPath, []byte(strconv.Itoa(pid)), 0600)
}
