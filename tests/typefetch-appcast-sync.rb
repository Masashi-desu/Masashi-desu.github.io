#!/usr/bin/env ruby

# 目的: TypeFetch appcast の生成、冪等更新、巻き戻し拒否を検証します。
# 期待値: version/build/link/情報更新要素が一致し、不正入力と downgrade が失敗します。
# 検証方法: 一時 appcast に対して同期スクリプトを実行し、REXML で結果を確認します。

require "fileutils"
require "minitest/autorun"
require "open3"
require "rexml/document"
require "rexml/xpath"
require "tmpdir"

SCRIPT = File.expand_path("../tools/sync-typefetch-appcast.rb", __dir__)
RELEASE_URL = "https://masashi-desu.itch.io/typefetch"
SOURCE_SHA = "0123456789abcdef0123456789abcdef01234567"
SPARKLE_NAMESPACE = "http://www.andymatuschak.org/xml-namespaces/sparkle"

class TypeFetchAppcastSyncTest < Minitest::Test
  def setup
    @directory = Dir.mktmpdir("typefetch-appcast-sync-test")
    @appcast = File.join(@directory, "appcast.xml")
  end

  def teardown
    FileUtils.remove_entry(@directory)
  end

  def run_sync(version: "1.2.0", build: "5", release_url: RELEASE_URL, source_sha: SOURCE_SHA)
    command = [
      "ruby", SCRIPT,
      "--version", version,
      "--build", build,
      "--release-url", release_url,
      "--source-sha", source_sha,
      "--appcast", @appcast
    ]
    Open3.capture3(*command)
  end

  def parse_appcast
    REXML::Document.new(File.read(@appcast))
  end

  def sparkle_text(document, element)
    namespaces = { "sparkle" => SPARKLE_NAMESPACE }
    REXML::XPath.first(document, "/rss/channel/item/sparkle:#{element}", namespaces)&.text.to_s
  end

  def test_generates_informational_appcast
    _stdout, stderr, status = run_sync

    assert(status.success?, stderr)
    document = parse_appcast
    assert_equal("1.2.0", sparkle_text(document, "shortVersionString"))
    assert_equal("5", sparkle_text(document, "version"))
    assert_equal(RELEASE_URL, REXML::XPath.first(document, "/rss/channel/item/link").text)
    assert(REXML::XPath.first(document, "/rss/channel/item/sparkle:informationalUpdate", { "sparkle" => SPARKLE_NAMESPACE }))
    refute(REXML::XPath.first(document, "/rss/channel/item/enclosure"))
    assert_equal("TypeFetch@#{SOURCE_SHA}", REXML::XPath.first(document, "/rss/channel/item/dc:identifier", { "dc" => "http://purl.org/dc/elements/1.1/" }).text)
  end

  def test_same_input_is_idempotent
    _stdout, stderr, status = run_sync
    assert(status.success?, stderr)
    first_content = File.read(@appcast)

    stdout, stderr, status = run_sync

    assert(status.success?, stderr)
    assert_match(/already synchronized/, stdout)
    assert_equal(first_content, File.read(@appcast))
  end

  def test_repairs_known_short_version_mismatch_for_same_build
    File.write(@appcast, <<~XML)
      <?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0"
        xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"
        xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel>
          <title>TypeFetch</title>
          <link>#{RELEASE_URL}</link>
          <description>TypeFetch appcast feed</description>
          <language>en</language>
          <item>
            <title>Version 1.1.0</title>
            <sparkle:version>4</sparkle:version>
            <sparkle:shortVersionString>1.0.2</sparkle:shortVersionString>
            <link>#{RELEASE_URL}</link>
            <pubDate>Fri, 23 Jan 2026 00:00:00 +0000</pubDate>
          </item>
        </channel>
      </rss>
    XML

    _stdout, stderr, status = run_sync(version: "1.1.0", build: "4")

    assert(status.success?, stderr)
    document = parse_appcast
    assert_equal("1.1.0", sparkle_text(document, "shortVersionString"))
    assert_equal("4", sparkle_text(document, "version"))
    refute(REXML::XPath.first(document, "/rss/channel/item/pubDate"))
  end

  def test_rejects_build_downgrade
    _stdout, stderr, status = run_sync(build: "5")
    assert(status.success?, stderr)

    _stdout, stderr, status = run_sync(version: "1.1.0", build: "4")

    refute(status.success?)
    assert_match(/downgrade/, stderr)
  end

  def test_rejects_marketing_version_downgrade_with_higher_build
    _stdout, stderr, status = run_sync(version: "1.2.0", build: "5")
    assert(status.success?, stderr)

    _stdout, stderr, status = run_sync(version: "1.1.0", build: "6")

    refute(status.success?)
    assert_match(/marketing version must increase/, stderr)
  end

  def test_rejects_unchanged_marketing_version_with_higher_build
    _stdout, stderr, status = run_sync(version: "1.2.0", build: "5")
    assert(status.success?, stderr)

    _stdout, stderr, status = run_sync(version: "1.2.0", build: "6")

    refute(status.success?)
    assert_match(/marketing version must increase/, stderr)
  end

  def test_rejects_different_version_for_same_build
    _stdout, stderr, status = run_sync(version: "1.2.0", build: "5")
    assert(status.success?, stderr)

    _stdout, stderr, status = run_sync(version: "2.0.0", build: "5")

    refute(status.success?)
    assert_match(/same appcast build/, stderr)
  end

  def test_rejects_different_source_for_same_build
    _stdout, stderr, status = run_sync
    assert(status.success?, stderr)

    _stdout, stderr, status = run_sync(source_sha: "ffffffffffffffffffffffffffffffffffffffff")

    refute(status.success?)
    assert_match(/same appcast build/, stderr)
  end

  def test_rejects_malformed_existing_appcast
    File.write(@appcast, "<rss><channel><item>")

    _stdout, stderr, status = run_sync

    refute(status.success?)
    assert_match(/malformed XML/, stderr)
  end

  def test_rejects_invalid_inputs
    invalid_cases = [
      { version: "01.2.0" },
      { build: "05" },
      { release_url: "https://example.com/typefetch" },
      { source_sha: "not-a-sha" },
      { source_sha: SOURCE_SHA.upcase }
    ]

    invalid_cases.each do |overrides|
      _stdout, _stderr, status = run_sync(**overrides)
      refute(status.success?, "expected failure for #{overrides.inspect}")
    end
  end
end
