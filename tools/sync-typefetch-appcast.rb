#!/usr/bin/env ruby

require "cgi"
require "fileutils"
require "optparse"
require "rexml/document"
require "rexml/xpath"

SPARKLE_NAMESPACE = "http://www.andymatuschak.org/xml-namespaces/sparkle"
ITCH_RELEASE_URL = "https://masashi-desu.itch.io/typefetch"
DEFAULT_APPCAST_PATH = File.expand_path("../site/products/TypeFetch/appcast.xml", __dir__)

def abort_with(message)
  warn("ERROR: #{message}")
  exit(1)
end

def parse_options
  options = {
    appcast: DEFAULT_APPCAST_PATH
  }

  parser = OptionParser.new do |opts|
    opts.banner = "Usage: sync-typefetch-appcast.rb --version x.y.z --build N --release-url URL --source-sha SHA [options]"
    opts.on("--version VERSION", "MARKETING_VERSION") { |value| options[:version] = value }
    opts.on("--build BUILD", "CURRENT_PROJECT_VERSION") { |value| options[:build] = value }
    opts.on("--release-url URL", "itch.io release URL") { |value| options[:release_url] = value }
    opts.on("--source-sha SHA", "TypeFetch source commit SHA") { |value| options[:source_sha] = value }
    opts.on("--appcast PATH", "appcast.xml output path") { |value| options[:appcast] = File.expand_path(value) }
  end
  parser.parse!
  abort_with("unexpected positional arguments: #{ARGV.join(" ")}") unless ARGV.empty?
  options
end

def validate_options(options)
  version = options[:version].to_s
  build = options[:build].to_s
  release_url = options[:release_url].to_s
  source_sha = options[:source_sha].to_s

  abort_with("version must use canonical x.y.z format") unless version.match?(/\A(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\z/)
  abort_with("build must be a canonical non-negative integer") unless build.match?(/\A(?:0|[1-9]\d*)\z/)
  abort_with("release URL must be #{ITCH_RELEASE_URL}") unless release_url == ITCH_RELEASE_URL
  abort_with("source SHA must contain exactly 40 lowercase hexadecimal characters") unless source_sha.match?(/\A[0-9a-f]{40}\z/)

  options.merge(
    version: version,
    build: build,
    release_url: release_url,
    source_sha: source_sha
  )
end

def text_at(document, xpath, namespaces = {})
  REXML::XPath.first(document, xpath, namespaces)&.text.to_s
end

def read_existing_appcast(path)
  return nil unless File.file?(path)

  content = File.read(path)
  document = REXML::Document.new(content)
  item = REXML::XPath.match(document, "/rss/channel/item")
  abort_with("existing appcast must contain exactly one item") unless item.length == 1

  namespace = document.root&.namespaces&.fetch("sparkle", nil)
  abort_with("existing appcast is missing the Sparkle namespace") if namespace.to_s.empty?
  namespaces = { "sparkle" => namespace }
  build = text_at(document, "/rss/channel/item/sparkle:version", namespaces)
  version = text_at(document, "/rss/channel/item/sparkle:shortVersionString", namespaces)
  title = text_at(document, "/rss/channel/item/title")
  release_url = text_at(document, "/rss/channel/item/link")
  identifier = text_at(document, "/rss/channel/item/dc:identifier", { "dc" => "http://purl.org/dc/elements/1.1/" })

  abort_with("existing appcast has an invalid sparkle:version") unless build.match?(/\A(?:0|[1-9]\d*)\z/)
  {
    content: content,
    build: build,
    version: version,
    title: title,
    release_url: release_url,
    identifier: identifier
  }
rescue REXML::ParseException => error
  abort_with("existing appcast is malformed XML: #{error.message.lines.first.to_s.strip}")
end

def validate_transition(existing, options)
  return unless existing

  current_build = Integer(existing[:build], 10)
  requested_build = Integer(options[:build], 10)
  abort_with("appcast build downgrade is not allowed: current=#{current_build}, requested=#{requested_build}") if requested_build < current_build

  if requested_build > current_build
    version_pattern = /\A(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\z/
    existing_versions = [existing[:version]]
    title_version = existing[:title].match(/\AVersion (.+)\z/)&.captures&.first
    existing_versions << title_version if title_version&.match?(version_pattern)
    existing_versions.select! { |version| version.match?(version_pattern) }
    abort_with("existing appcast has an invalid marketing version") if existing_versions.empty?

    current_version = existing_versions.map { |version| version.split(".").map(&:to_i) }.max
    requested_version = options[:version].split(".").map(&:to_i)
    if (requested_version <=> current_version) <= 0
      abort_with("appcast marketing version must increase with the build number")
    end
    return
  end

  expected_title = "Version #{options[:version]}"
  if existing[:version] != options[:version] && existing[:title] != expected_title
    abort_with("the same appcast build cannot be assigned to another version")
  end

  expected_identifier = "TypeFetch@#{options[:source_sha]}"
  if !existing[:identifier].empty? && existing[:identifier] != expected_identifier
    abort_with("the same appcast build cannot be assigned to another source commit")
  end
end

def xml(value)
  CGI.escapeHTML(value.to_s)
end

def render_appcast(options)
  identifier = "TypeFetch@#{options[:source_sha]}"
  <<~XML
    <?xml version="1.0" encoding="utf-8"?>
    <rss version="2.0"
      xmlns:sparkle="#{SPARKLE_NAMESPACE}"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel>
        <title>TypeFetch</title>
        <link>#{xml(options[:release_url])}</link>
        <description>TypeFetch appcast feed</description>
        <language>en</language>
        <item>
          <title>Version #{xml(options[:version])}</title>
          <link>#{xml(options[:release_url])}</link>
          <sparkle:shortVersionString>#{xml(options[:version])}</sparkle:shortVersionString>
          <sparkle:version>#{xml(options[:build])}</sparkle:version>
          <sparkle:releaseNotesLink>#{xml(options[:release_url])}</sparkle:releaseNotesLink>
          <sparkle:informationalUpdate/>
          <dc:identifier>#{xml(identifier)}</dc:identifier>
        </item>
      </channel>
    </rss>
  XML
end

def write_atomically(path, content)
  FileUtils.mkdir_p(File.dirname(path))
  temporary_path = "#{path}.tmp.#{$$}"
  File.write(temporary_path, content)
  File.rename(temporary_path, path)
ensure
  FileUtils.rm_f(temporary_path) if defined?(temporary_path)
end

options = validate_options(parse_options)
existing = read_existing_appcast(options[:appcast])
validate_transition(existing, options)

content = render_appcast(options)

if existing && existing[:content] == content
  puts("TypeFetch appcast is already synchronized: #{options[:version]} (#{options[:build]})")
  exit(0)
end

write_atomically(options[:appcast], content)
REXML::Document.new(File.read(options[:appcast]))
puts("Synchronized TypeFetch appcast: #{options[:version]} (#{options[:build]})")
puts("Output: #{options[:appcast]}")
