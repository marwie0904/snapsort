import pytest

from snapsort.modules import discover

MODULE_SRC = """
from snapsort.contract import Module

class M(Module):
    name = {name!r}

    def process(self, frames):
        return []
"""


def make_package(tmp_path, monkeypatch, files: dict[str, str]) -> str:
    """Write a throwaway package of module files and make it importable. Returns its name."""
    name = f"mods_{tmp_path.name}"
    pkg = tmp_path / name
    pkg.mkdir()
    (pkg / "__init__.py").write_text("")
    for filename, src in files.items():
        (pkg / filename).write_text(src)
    monkeypatch.syspath_prepend(str(tmp_path))
    return name


def test_finds_real_example_module():
    assert "example" in [m.name for m in discover()]


def test_skips_underscore_files_and_broken_imports(tmp_path, monkeypatch, capsys):
    pkg = make_package(tmp_path, monkeypatch, {
        "good.py": MODULE_SRC.format(name="good"),
        "_off.py": MODULE_SRC.format(name="off"),
        "broken.py": "import not_a_real_dependency\n",
    })
    assert [m.name for m in discover(pkg)] == ["good"]
    assert "broken.py failed to import" in capsys.readouterr().err


def test_skips_modules_whose_constructor_raises(tmp_path, monkeypatch, capsys):
    broken = MODULE_SRC.format(name="ctor") + "\n    def __init__(self):\n        raise RuntimeError('no gpu')\n"
    pkg = make_package(tmp_path, monkeypatch, {
        "good.py": MODULE_SRC.format(name="good"),
        "ctor.py": broken,
    })
    assert [m.name for m in discover(pkg)] == ["good"]
    assert "ctor.M failed to instantiate" in capsys.readouterr().err


def test_rejects_duplicate_names(tmp_path, monkeypatch):
    pkg = make_package(tmp_path, monkeypatch, {
        "one.py": MODULE_SRC.format(name="same"),
        "two.py": MODULE_SRC.format(name="same"),
    })
    with pytest.raises(ValueError, match="duplicate"):
        discover(pkg)


def test_rejects_invalid_names(tmp_path, monkeypatch):
    pkg = make_package(tmp_path, monkeypatch, {"one.py": MODULE_SRC.format(name="Bad-Name")})
    with pytest.raises(ValueError, match="invalid"):
        discover(pkg)


@pytest.mark.parametrize("version", [2, ""])
def test_rejects_non_string_or_empty_versions(tmp_path, monkeypatch, version):
    src = MODULE_SRC.format(name="one") + f"    version = {version!r}\n"
    pkg = make_package(tmp_path, monkeypatch, {"one.py": src})
    with pytest.raises(ValueError, match="version"):
        discover(pkg)
