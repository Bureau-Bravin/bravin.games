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
        let filePath = path.join(outputDir, req.url === '/' ? 'index.html' : req.url);
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
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

    // Read template
    const template = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf-8');

    // Read header template directly without markdown processing
    const headerHTML = fs.readFileSync(path.join(templateDir, 'header.html'), 'utf8');

    // Read and process the about section
    const aboutContent = fs.readFileSync(path.join(contentDir, 'about.md'), 'utf-8');
    const aboutHTML = markdown.convert(aboutContent);

    // Read and process project files
    const projectDir = path.join(contentDir, 'projects');
    const projectFiles = fs.readdirSync(projectDir);
    
    const projectsHTML = projectFiles.map(file => {
        const projectContent = fs.readFileSync(path.join(projectDir, file), 'utf-8');
        
        // Parse frontmatter
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
        const match = projectContent.match(frontmatterRegex);
        const frontmatter = match ? match[1].split('\n').reduce((acc, line) => {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key && value) {
                acc[key] = value.replace(/['"]/g, ''); // Remove quotes
            }
            return acc;
        }, {}) : {};

        const projectName = path.basename(file, '.md');
        return `
            <div class="project">
                <a href="/projects/${projectName}.html">
                    <img src="/assets/${frontmatter.title_image || projectName + '.jpg'}" alt="${projectName}">
                </a>
            </div>
        `;
    }).join('\n');

    // Read header and footer templates
    const footerTemplate = fs.readFileSync(path.join(templateDir, 'footer.html'), 'utf8');

    // When generating individual project pages
    projectFiles.forEach(file => {
        const projectContent = fs.readFileSync(path.join(projectDir, file), 'utf-8');
        const contentWithoutFrontmatter = projectContent.replace(/^---\n[\s\S]*?\n---\n/, '');
        const projectHTML = markdown.convert(contentWithoutFrontmatter);
        
        // Create project page using template
        const projectTemplate = fs.readFileSync(path.join(templateDir, 'project.html'), 'utf8');
        const finalProjectHTML = replaceVariables(projectTemplate, {
            title: path.basename(file, '.md'),
            content: projectHTML,
            header: headerHTML,
            footer: footerTemplate
        });

        // Create projects directory if it doesn't exist
        const projectsOutputDir = path.join(outputDir, 'projects');
        if (!fs.existsSync(projectsOutputDir)) {
            fs.mkdirSync(projectsOutputDir, { recursive: true });
        }

        // Write project page
        const outputFile = path.join(projectsOutputDir, `${path.basename(file, '.md')}.html`);
        fs.writeFileSync(outputFile, finalProjectHTML);
    });

    // Replace variables in template
    const finalHTML = replaceVariables(template, {
        title: 'Game Studio',
        header: headerHTML,
        about: aboutHTML,
        projects: projectsHTML
    });

    // Write final HTML
    fs.writeFileSync(path.join(outputDir, 'index.html'), finalHTML);

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
    }

    console.log('Build completed successfully!');
    
    // Start the server after successful build
    startServer();
}

build();