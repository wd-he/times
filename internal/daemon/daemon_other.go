//go:build !aix && !darwin && !dragonfly && !freebsd && !hurd && !illumos && !ios && !linux && !netbsd && !openbsd && !solaris

package daemon

import "os/exec"

func configure(_ *exec.Cmd) error { return nil }
