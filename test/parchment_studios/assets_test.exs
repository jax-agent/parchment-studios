defmodule ParchmentStudios.AssetsTest do
  use ParchmentStudios.DataCase, async: true

  alias ParchmentStudios.Assets

  defp create_pack(_context \\ %{}) do
    {:ok, pack} = Assets.create_pack(%{name: "Test Pack", style: "classic_fantasy"})
    %{pack: pack}
  end

  defp stamp_layers do
    [
      %{
        "id" => "base",
        "type" => "BASE",
        "blend_mode" => "normal",
        "opacity" => 1.0,
        "visible" => true,
        "frames" => [],
        "fps" => 0
      },
      %{
        "id" => "shadow",
        "type" => "SHADOW",
        "blend_mode" => "multiply",
        "opacity" => 1.0,
        "visible" => true,
        "frames" => [],
        "fps" => 0,
        "keyed_to" => "lightAngle"
      }
    ]
  end

  describe "packs" do
    test "list_packs/0 returns all packs" do
      %{pack: pack} = create_pack()
      assert [fetched] = Assets.list_packs()
      assert fetched.id == pack.id
    end

    test "get_pack!/1 returns pack by id" do
      %{pack: pack} = create_pack()
      assert Assets.get_pack!(pack.id).id == pack.id
    end

    test "create_pack/1 validates name is required" do
      assert {:error, changeset} = Assets.create_pack(%{})
      assert "can't be blank" in errors_on(changeset).name
    end
  end

  describe "stamp assets" do
    setup do
      create_pack()
    end

    test "list_assets/1 returns assets for a pack", %{pack: pack} do
      {:ok, _asset} =
        Assets.create_asset(%{name: "Test Stamp", pack_id: pack.id, category: "terrain"})

      assert [fetched] = Assets.list_assets(pack.id)
      assert fetched.name == "Test Stamp"
    end

    test "list_assets_by_category/2 filters by category", %{pack: pack} do
      {:ok, _} =
        Assets.create_asset(%{name: "City", pack_id: pack.id, category: "settlements"})

      {:ok, _} =
        Assets.create_asset(%{name: "Mountain", pack_id: pack.id, category: "terrain"})

      settlements = Assets.list_assets_by_category(pack.id, "settlements")
      assert length(settlements) == 1
      assert hd(settlements).name == "City"

      terrain = Assets.list_assets_by_category(pack.id, "terrain")
      assert length(terrain) == 1
      assert hd(terrain).name == "Mountain"
    end

    test "create_asset/1 stores layers correctly (jsonb round-trip)", %{pack: pack} do
      layers = stamp_layers()

      {:ok, asset} =
        Assets.create_asset(%{
          name: "Layered Stamp",
          pack_id: pack.id,
          category: "settlements",
          layers: layers
        })

      fetched = Repo.get!(ParchmentStudios.Assets.StampAsset, asset.id)
      assert length(fetched.layers) == 2

      [base, shadow] = fetched.layers
      assert base["type"] == "BASE"
      assert base["blend_mode"] == "normal"
      assert shadow["type"] == "SHADOW"
      assert shadow["blend_mode"] == "multiply"
      assert shadow["keyed_to"] == "lightAngle"
    end
  end
end
