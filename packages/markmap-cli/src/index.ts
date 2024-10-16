import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import open from 'open';
import updateNotifier from 'update-notifier';
import { readPackageUp } from 'read-package-up';
import { CSSItem, JSItem, buildJSItem } from 'markmap-common';
import {
  Transformer,
  type IMarkmapCreateOptions,
  type IAssets,
} from 'markmap-lib';
import { baseJsPaths, fillTemplate } from 'markmap-render';
import { ASSETS_PREFIX, addToolbar, config, localProvider } from './util';
import { IDevelopOptions } from './types';
import { develop } from './dev-server';
import { fetchAssets } from './fetch-assets';
import puppeteer from 'puppeteer';
import path from 'path';

export * from 'markmap-lib';
export * from './types';
export { config, develop, fetchAssets };

async function loadFile(path: string) {
  if (path.startsWith(ASSETS_PREFIX)) {
    const relpath = path.slice(ASSETS_PREFIX.length);
    return readFile(resolve(config.assetsDir, relpath), 'utf8');
  }
  const res = await fetch(path);
  if (!res.ok) throw res;
  return res.text();
}

async function inlineAssets(assets: IAssets): Promise<IAssets> {
  const [scripts, styles] = await Promise.all([
    Promise.all(
      (assets.scripts || []).map(
        async (item): Promise<JSItem> =>
          item.type === 'script' && item.data.src
            ? {
                type: 'script',
                data: {
                  textContent: await loadFile(item.data.src),
                },
              }
            : item,
      ),
    ),
    Promise.all(
      (assets.styles || []).map(
        async (item): Promise<CSSItem> =>
          item.type === 'stylesheet'
            ? {
                type: 'style',
                data: await loadFile(item.data.href),
              }
            : item,
      ),
    ),
  ]);
  return {
    scripts,
    styles,
  };
}

function getFormatFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.html':
      return 'html';
    case '.svg':
      return 'svg';
    case '.png':
      return 'png';
    case '.pdf':
      return 'pdf';
    default:
      return 'html'; // 默认为 HTML
  }
}

export async function createMarkmap(
  options: IMarkmapCreateOptions & IDevelopOptions,
): Promise<void> {
  if (!options.output) {
    throw new Error('Output file path is not specified');
  }

  const outputPath = options.output as string;
  const format = getFormatFromFilename(outputPath);

  const transformer = new Transformer();
  if (options.offline) {
    transformer.urlBuilder.setProvider('local', localProvider);
    transformer.urlBuilder.provider = 'local';
  } else {
    try {
      await transformer.urlBuilder.findFastestProvider();
    } catch {
      console.error('Failed to find fastest provider, using default');
    }
  }
  const { root, features, frontmatter } = transformer.transform(
    options.content || '',
  );
  let assets = transformer.getUsedAssets(features);
  assets = {
    ...assets,
    scripts: [
      ...baseJsPaths
        .map((path) => transformer.urlBuilder.getFullUrl(path))
        .map((path) => buildJSItem(path)),
      ...(assets.scripts || []),
    ],
  };
  if (options.toolbar) {
    assets = addToolbar(transformer.urlBuilder, assets);
  }
  if (options.offline) {
    assets = await inlineAssets(assets);
  }
  const html = fillTemplate(root, assets, {
    baseJs: [],
    jsonOptions: (frontmatter as any)?.markmap,
    urlBuilder: transformer.urlBuilder,
  });

  if (format === 'svg' || format === 'png' || format === 'pdf') {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // <- this one doesn't works in Windows
      ],
    });

    try {
      const page = await browser.newPage();

      // 设置更长的默认超时时间
      page.setDefaultTimeout(60000);

      // 设置内容并等待加载完成
      await page.setContent(html, {
        waitUntil: ['load', 'networkidle0'],
        timeout: 60000,
      });

      // 等待 SVG 元素出现
      await page.waitForSelector('svg', { timeout: 30000 });

      // 使用 JavaScript 获取实际内容大小并设置样式
      const dimensions = await page.evaluate(() => {
        const svg = document.querySelector('svg');
        if (!svg) return null;
        svg.style.display = 'block';
        svg.style.margin = '0';
        svg.style.padding = '0';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.background = 'transparent'; // 设置透明背景
        const rect = svg.getBoundingClientRect();
        return {
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
        };
      });

      if (!dimensions) {
        throw new Error('Failed to get SVG dimensions');
      }

      // 设置页面视口
      await page.setViewport({
        width: dimensions.width,
        height: dimensions.height,
        deviceScaleFactor: 2, // 使用更高的缩放比例以获得更好的质量
      });

      // 短暂等待以确保内容完全渲染
      await page.waitForTimeout(1000);

      if (format === 'svg') {
        const svgContent = await page.evaluate(() => {
          const svg = document.querySelector('svg');
          if (!svg) return '';

          // 确保 SVG 有正确的命名空间
          svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

          // 获取所有样式
          const styles = Array.from(document.styleSheets)
            .flatMap((sheet) => {
              try {
                return Array.from(sheet.cssRules);
              } catch (e) {
                console.warn('Unable to access cssRules for a stylesheet');
                return [];
              }
            })
            .map((rule) => rule.cssText)
            .join('\n');

          // 添加样式
          const styleElement = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'style',
          );
          styleElement.textContent = styles;
          svg.insertBefore(styleElement, svg.firstChild);

          // 返回完整的 SVG 字符串
          return (
            '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
            svg.outerHTML
          );
        });

        if (svgContent) {
          await writeFile(outputPath, svgContent, 'utf8');
          console.log('SVG file written to:', outputPath);
        } else {
          throw new Error('Failed to generate SVG content');
        }
      } else if (format === 'png') {
        await page.evaluate(() => {
          // 确保 SVG 和其父元素有白色背景
          const svg = document.querySelector('svg');
          if (svg) {
            svg.style.background = 'white';
            if (svg.parentElement) {
              svg.parentElement.style.background = 'white';
            }
          }
          document.body.style.background = 'white';
        });

        await page.screenshot({
          path: outputPath,
          fullPage: true,
          omitBackground: false, // 不省略背景，以确保白色背景
        });
        console.log('PNG file written to:', outputPath);
      } else if (format === 'pdf') {
        await page.pdf({
          path: outputPath,
          width: dimensions.width,
          height: dimensions.height,
          printBackground: true,
          scale: 1,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          timeout: 60000, // 设置更长的超时时间
        });
        console.log('PDF file written to:', outputPath);
      }
    } catch (error) {
      console.error('An error occurred during file generation:', error);
      process.exit(1);
    } finally {
      await browser.close();
    }
  } else {
    await writeFile(outputPath, html, 'utf8');
    console.log('HTML file written to:', outputPath);
  }

  if (options.open) {
    open(outputPath);
  }
}

export async function main() {
  const pkg = (
    await readPackageUp({
      cwd: resolve(fileURLToPath(import.meta.url)),
    })
  )?.packageJson;
  if (!pkg) throw new Error('package.json not found');

  const notifier = updateNotifier({ pkg });
  notifier.notify();

  const program = new Command();
  program
    .version(pkg.version)
    .description('Create a markmap from a Markdown input file')
    .arguments('<input>')
    .option('--no-open', 'do not open the output file after generation')
    .option('--no-toolbar', 'do not show toolbar')
    .option('-o, --output <output>', 'specify filename of the output file')
    .option(
      '--offline',
      'Inline all assets to allow the generated file to work offline',
    )
    .option(
      '-w, --watch',
      'watch the input file and update output on the fly, note that this feature is for development only',
    )
    .action(async (input, cmd) => {
      let { offline } = cmd;
      if (cmd.watch) offline = true;
      if (offline) {
        await fetchAssets();
      }
      const content = await readFile(input, 'utf8');
      const output = cmd.output || `${input.replace(/\.\w*$/, '')}.html`;
      if (cmd.watch) {
        await develop(input, {
          open: cmd.open,
          toolbar: cmd.toolbar,
          offline,
        });
      } else {
        await createMarkmap({
          content,
          output,
          open: cmd.open,
          toolbar: cmd.toolbar,
          offline,
        });
      }
    });

  program.parse(process.argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('An error occurred:', error);
    process.exit(1);
  });
}
