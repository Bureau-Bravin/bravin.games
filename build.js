#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const markdown = require('./markdown');

// Fix paths to be relative to the current file location
const contentDir = path.join(__dirname, 'src/content');
const outputDir = path.join(__dirname, 'site');  // Changed from 'dist' to 'site'
const templateDir = path.join(__dirname, 'src/templates');
const stylesDir = path.join(__dirname, 'src/styles'); // Add this line
const assetsDir = path.join(__dirname, 'src/assets'); // Add this line

function replaceVariables(template, variables) {
    return Object.keys(variables).reduce((result, key) => {
        return result.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
    }, template);
}

function startServer() {
    const server = http.createServer((req, res) => {
        let url = req.url;
        
        // Handle URLs without file extensions by attempting to serve as .html
        if (!path.extname(url) && !url.endsWith('/')) {
            url += '/';
        }
        
        // Handle URLs ending with a slash by attempting to serve index.html
        if (url.endsWith('/')) {
            url += 'index.html';
        }
        
        let filePath = path.join(outputDir, url === '/' ? 'index.html' : url);
        
        console.log(`Requested: ${req.url} => File path: ${filePath}`);
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                // Try with .html extension if file not found and no extension provided
                if (!path.extname(req.url)) {
                    const htmlFilePath = path.join(outputDir, `${req.url}.html`);
                    fs.readFile(htmlFilePath, (htmlErr, htmlData) => {
                        if (htmlErr) {
                            res.writeHead(404);
                            res.end('File not found');
                            console.log(`404 Not Found: ${filePath} (also tried ${htmlFilePath})`);
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(htmlData);
                        console.log(`200 OK: ${htmlFilePath}`);
                    });
                    return;
                }
                
                res.writeHead(404);
                res.end('File not found');
                console.log(`404 Not Found: ${filePath}`);
                return;
            }

            const ext = path.extname(filePath);
            const contentType = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'text/javascript',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
            }[ext] || 'text/plain';

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
            console.log(`200 OK: ${filePath}`);
        });
    });

    const PORT = 1717;
    server.listen(PORT, () => {
        console.log(`\nServer running at http://localhost:${PORT}`);
        console.log('Press Ctrl+C to stop the server');
    });
}

function build() {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Read templates
    const indexTemplate = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf-8');
    const headerHTML = fs.readFileSync(path.join(templateDir, 'header.html'), 'utf8');
    const footerTemplate = fs.readFileSync(path.join(templateDir, 'footer.html'), 'utf8');
    const menuTemplate = fs.readFileSync(path.join(templateDir, 'menu.html'), 'utf8');
    const projectTemplate = fs.readFileSync(path.join(templateDir, 'project.html'), 'utf8');
    
    // Process all markdown files in the content directory
    const mainContentFiles = [];
    const specialPageFiles = [];
    
    // Read all markdown files in the content directory
    fs.readdirSync(contentDir).forEach(file => {
        if (!file.endsWith('.md')) return; // Skip non-markdown files
        
        const content = fs.readFileSync(path.join(contentDir, file), 'utf-8');
        
        // Parse frontmatter
        const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
        const match = content.match(frontmatterRegex);
        let frontmatter = {};
        let markdownContent = content;
        
        if (match) {
            frontmatter = match[1].split('\n').reduce((acc, line) => {
                line = line.trim();
                if (!line) return acc;
                
                if (line.startsWith('-')) {
                    // Handle array items
                    const value = line.slice(1).trim();
                    const lastKey = Object.keys(acc).pop();
                    if (!acc[lastKey]) {
                        acc[lastKey] = [];
                    }
                    acc[lastKey].push(value);
                } else {
                    // Handle key-value pairs
                    const colonIndex = line.indexOf(':');
                    if (colonIndex !== -1) {
                        const key = line.slice(0, colonIndex).trim();
                        const value = line.slice(colonIndex + 1).trim();
                        acc[key] = value.replace(/^["'](.*)["']$/, '$1');
                    }
                }
                return acc;
            }, {});
            
            // Get content after frontmatter
            markdownContent = content.replace(frontmatterRegex, '');
        }
        
        const htmlContent = markdown.convert(markdownContent);
        
        // Categorize files
        if (frontmatter.permalink) {
            specialPageFiles.push({
                file,
                frontmatter,
                htmlContent
            });
        } else if (file === 'about.md') {
            mainContentFiles.push({
                id: 'about',
                htmlContent
            });
        } else if (file === 'contacts.md') {
            // Handle contacts with social links
            const socialLinksBlock = frontmatter.contacts ? 
                `<div class="store-links"><div class="store-links-wrapper">${
                    markdown.convert(frontmatter.contacts.join(' ').replace(/\!\[\]\((.*?\.png)\)/g, '![](/assets/$1)'))
                }</div></div>` : '';
            
            mainContentFiles.push({
                id: 'contacts',
                htmlContent: htmlContent + socialLinksBlock
            });
        }
    });
    
    // Process project files
    const projectsDir = path.join(contentDir, 'projects');
    if (fs.existsSync(projectsDir)) {
        const projectFiles = fs.readdirSync(projectsDir);
        
        const projectsHTML = projectFiles.map(file => {
            const projectContent = fs.readFileSync(path.join(projectsDir, file), 'utf-8');
            
            // Remove BOM and normalize line endings
            const normalizedContent = projectContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
            
            // Parse frontmatter
            const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
            const match = normalizedContent.match(frontmatterRegex);
            
            const frontmatter = match ? match[1].split('\n').reduce((acc, line) => {
                line = line.trim();
                
                if (!line) return acc;
                
                if (line.startsWith('-')) {
                    // Handle array items
                    const value = line.slice(1).trim();
                    const lastKey = Object.keys(acc).pop();
                    if (!acc[lastKey]) {
                        acc[lastKey] = [];
                    }
                    acc[lastKey].push(value);
                } else {
                    // Handle key-value pairs
                    const colonIndex = line.indexOf(':');
                    if (colonIndex !== -1) {
                        const key = line.slice(0, colonIndex).trim();
                        const value = line.slice(colonIndex + 1).trim();
                        // Remove quotes if they exist
                        acc[key] = value.replace(/^["'](.*)["']$/, '$1');
                    }
                }
                return acc;
            }, {}) : {};

            const projectName = path.basename(file, '.md');
            return `
                <div class="project">
                    <a href="/projects/${projectName}/">
                        <img src="/assets/${frontmatter.preview_image}" alt="${projectName}">
                    </a>
                </div>
            `;
        }).join('\n');

        mainContentFiles.push({
            id: 'projects',
            htmlContent: projectsHTML
        });
        
        // Generate project pages
        projectFiles.forEach(file => {
            const projectContent = fs.readFileSync(path.join(projectsDir, file), 'utf-8');
            const normalizedContent = projectContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
            
            // Parse frontmatter
            const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
            const match = normalizedContent.match(frontmatterRegex);
            const frontmatter = match ? match[1].split('\n').reduce((acc, line) => {
                line = line.trim();
                if (!line) return acc;
                
                if (line.startsWith('-')) {
                    const value = line.slice(1).trim();
                    const lastKey = Object.keys(acc).pop();
                    if (!acc[lastKey]) {
                        acc[lastKey] = [];
                    }
                    acc[lastKey].push(value);
                } else {
                    const colonIndex = line.indexOf(':');
                    if (colonIndex !== -1) {
                        const key = line.slice(0, colonIndex).trim();
                        const value = line.slice(colonIndex + 1).trim();
                        acc[key] = value.replace(/^["'](.*)["']$/, '$1');
                    }
                }
                return acc;
            }, {}) : {};

            // Generate media HTML if media exists
            const mediaHTML = frontmatter.media ? frontmatter.media.map((url, index) => {
                if (url.includes('youtube.com')) {
                    return `
                        <div class="project media-item">
                            <div class="media-overlay" data-media-type="video" data-media-url="${url.replace('watch?v=', 'embed/')}"></div>
                            <iframe src="${url.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen></iframe>
                        </div>`;
                }
                return `
                    <div class="project media-item">
                        <div class="media-overlay" data-media-type="image" data-media-url="/assets/${url}"></div>
                        <img src="/assets/${url}" alt="Screenshot">
                    </div>`;
            }).join('\n') : '';

            // Create project page using template
            const finalProjectHTML = replaceVariables(projectTemplate, {
                title: frontmatter.title || '',
                title_block: frontmatter.title ? `<h1>${frontmatter.title}</h1>` : '',
                release_block: frontmatter.release_data ? `<div class="release-date">Released: ${frontmatter.release_data}</div>` : '',
                store_block: frontmatter.store ? `<div class="store-links-wrapper">${
                    markdown.convert(frontmatter.store.join(' ').replace(/\!\[\]\((.*?\.png)\)/g, '![](/assets/$1)'))
                }</div>` : '',
                description_block: frontmatter.description ? `<div class="description">${frontmatter.description}</div>` : '',
                media_block: mediaHTML ? `<div class="projects-grid">${mediaHTML}</div>` : '',
                header: headerHTML,
                footer: footerTemplate,
                menu: menuTemplate.replace(/{{#if isProject}}(.*?){{\/if}}/g, '$1')
            });

            // Create projects directory if it doesn't exist
            const projectsOutputDir = path.join(outputDir, 'projects');
            if (!fs.existsSync(projectsOutputDir)) {
                fs.mkdirSync(projectsOutputDir, { recursive: true });
            }

            // Write project page with clean URLs
            const projectName = path.basename(file, '.md');
            const projectOutputDir = path.join(projectsOutputDir, projectName);
            if (!fs.existsSync(projectOutputDir)) {
                fs.mkdirSync(projectOutputDir, { recursive: true });
            }
            const outputFile = path.join(projectOutputDir, 'index.html');
            fs.writeFileSync(outputFile, finalProjectHTML);
        });
    }
    
    // Build main index page
    const mainContent = {};
    mainContentFiles.forEach(item => {
        mainContent[item.id] = item.htmlContent;
    });
    
    // Build index page
    const indexHTML = replaceVariables(indexTemplate, {
        title: 'Game Studio',
        header: headerHTML,
        about: mainContent.about || '',
        projects: mainContent.projects || '',
        contacts: mainContent.contacts || '',
        menu: menuTemplate.replace(/{{#if isProject}}(.*?){{\/if}}/g, '')
    });
    
    fs.writeFileSync(path.join(outputDir, 'index.html'), indexHTML);
    
    // Process special pages with permalinks
    specialPageFiles.forEach(({ file, frontmatter, htmlContent }) => {
        // Create HTML with or without styling based on no_style attribute
        let finalHTML;
        if (frontmatter.no_style === true || frontmatter.no_style === 'true') {
            // Use the no_style template
            const noStyleTemplate = fs.readFileSync(path.join(templateDir, 'no_style.html'), 'utf-8');
            finalHTML = replaceVariables(noStyleTemplate, {
                title: frontmatter.title || '',
                content: htmlContent
            });
        } else {
            // Use the standard template with main content replaced
            const templateHTML = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf-8');
            const mainContentPattern = /<main>[\s\S]*?<\/main>/;
            const templateWithReplacedMain = templateHTML.replace(mainContentPattern, `<main>${htmlContent}</main>`);
                
            finalHTML = replaceVariables(templateWithReplacedMain, {
                title: frontmatter.title || '',
                header: headerHTML,
                menu: menuTemplate.replace(/{{#if isProject}}(.*?){{\/if}}/g, '')
            });
        }
        
        // Create directory structure for the permalink
        const permalink = frontmatter.permalink.startsWith('/') ? frontmatter.permalink.substring(1) : frontmatter.permalink;
        
        // Always use directory structure with index.html for clean URLs
        let outputPath;
        if (permalink.endsWith('/')) {
            outputPath = `${permalink}index.html`;
        } else {
            outputPath = `${permalink}/index.html`;
        }
        
        const outputFilePath = path.join(outputDir, outputPath);
        
        // Debug output
        console.log(`Processing file: ${file}`);
        console.log(`  Permalink: ${frontmatter.permalink}`);
        console.log(`  no_style: ${frontmatter.no_style}`);
        console.log(`  Output path: ${outputPath}`);
        console.log(`  Full output path: ${outputFilePath}`);
        
        // Ensure directory exists
        const outputDirPath = path.dirname(outputFilePath);
        if (!fs.existsSync(outputDirPath)) {
            fs.mkdirSync(outputDirPath, { recursive: true });
        }
        
        // Write the file
        fs.writeFileSync(outputFilePath, finalHTML);
    });

    // Copy CSS file
    fs.copyFileSync(
        path.join(stylesDir, 'main.css'),
        path.join(outputDir, 'main.css')
    );

    // Copy images
    const imagesDir = path.join(__dirname, 'src/images');
    if (fs.existsSync(imagesDir)) {
        fs.mkdirSync(path.join(outputDir, 'images'), { recursive: true });
        fs.readdirSync(imagesDir).forEach(file => {
            fs.copyFileSync(
                path.join(imagesDir, file),
                path.join(outputDir, 'images', file)
            );
        });
    }

    // Copy assets
    if (fs.existsSync(assetsDir)) {
        fs.mkdirSync(path.join(outputDir, 'assets'), { recursive: true });
        fs.readdirSync(assetsDir).forEach(file => {
            fs.copyFileSync(
                path.join(assetsDir, file),
                path.join(outputDir, 'assets', file)
            );
        });

        // Ensure modal.js is copied
        if (fs.existsSync(path.join(assetsDir, 'modal.js'))) {
            fs.copyFileSync(
                path.join(assetsDir, 'modal.js'),
                path.join(outputDir, 'assets', 'modal.js')
            );
        }
    }

    console.log('Build completed successfully!');
    
    // Start the server after successful build
    startServer();
}

build();