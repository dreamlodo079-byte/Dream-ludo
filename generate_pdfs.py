import os
import re
from markdown_it import MarkdownIt
from weasyprint import HTML

def render_md_to_pdf(md_path, pdf_path):
    print(f"Reading {md_path}...")
    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    # Parse Markdown to HTML
    md = MarkdownIt()
    html_content = md.render(md_text)

    # Post-process callout blocks [!IMPORTANT] and [!NOTE]
    # Replace markdown-it output for blockquotes with beautiful alert divs
    html_content = re.sub(
        r'<blockquote>\s*<p>\[!IMPORTANT\]',
        '<div class="alert-box important"><p>',
        html_content,
        flags=re.IGNORECASE
    )
    html_content = re.sub(
        r'<blockquote>\s*<p>\[!NOTE\]',
        '<div class="alert-box note"><p>',
        html_content,
        flags=re.IGNORECASE
    )
    html_content = html_content.replace('</blockquote>', '</div>')

    # CSS for premium PDF styling
    css = """
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    
    @page {
        size: A4;
        margin: 20mm;
        @bottom-right {
            content: "Page " counter(page) " of " counter(pages);
            font-family: 'Inter', sans-serif;
            font-size: 8.5pt;
            color: #94A3B8;
        }
    }
    
    body {
        font-family: 'Inter', sans-serif;
        color: #1E293B;
        line-height: 1.6;
        font-size: 10pt;
    }
    
    h1 {
        font-size: 20pt;
        font-weight: 800;
        color: #0F172A;
        margin-top: 0;
        margin-bottom: 5px;
        letter-spacing: -0.5px;
    }
    
    p {
        margin-top: 0;
        margin-bottom: 12px;
        color: #475569;
    }
    
    strong {
        color: #0F172A;
        font-weight: 600;
    }
    
    /* Horizontal rule */
    hr {
        border: 0;
        height: 1px;
        background: #E2E8F0;
        margin: 25px 0;
    }
    
    /* Subtitles / target profile */
    p:has(strong) {
        margin-bottom: 6px;
    }
    
    h2 {
        font-size: 13.5pt;
        font-weight: 700;
        color: #0F172A;
        border-left: 4px solid #F59E0B;
        padding-left: 10px;
        margin-top: 30px;
        margin-bottom: 15px;
        page-break-after: avoid;
    }
    
    /* Tables styling */
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
        margin-bottom: 25px;
        page-break-inside: avoid;
    }
    
    th {
        background-color: #0F172A;
        color: #FFFFFF;
        font-weight: 600;
        text-align: left;
        padding: 10px 12px;
        font-size: 9pt;
        border: 1px solid #0F172A;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    td {
        padding: 10px 12px;
        font-size: 9pt;
        border: 1px solid #E2E8F0;
        vertical-align: top;
        color: #334155;
        line-height: 1.5;
    }
    
    tr:nth-child(even) td {
        background-color: #F8FAFC;
    }
    
    /* Alert / Outlay boxes styling */
    .alert-box {
        padding: 15px;
        margin: 20px 0;
        border-radius: 6px;
        font-size: 10.5pt;
    }
    
    .alert-box.important {
        background-color: #FEF9C3; /* light yellow */
        border: 1px solid #FEF08A;
        border-left: 4px solid #CA8A04;
        color: #854D0E;
    }
    
    .alert-box.important p {
        color: #854D0E;
        margin: 0;
    }
    
    .alert-box.note {
        background-color: #EFF6FF; /* light blue */
        border: 1px solid #DBEAFE;
        border-left: 4px solid #3B82F6;
        color: #1E40AF;
    }
    
    .alert-box.note p {
        color: #1E40AF;
        margin: 0;
    }
    
    /* Lists inside tables */
    ul {
        margin: 0;
        padding-left: 15px;
    }
    
    li {
        margin-bottom: 6px;
    }
    
    li:last-child {
        margin-bottom: 0;
    }
    """

    full_html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Proposal Document</title>
    <style>
        {css}
    </style>
</head>
<body>
    {html_content}
</body>
</html>
"""

    temp_html_path = md_path.replace(".md", "_temp.html")
    with open(temp_html_path, "w", encoding="utf-8") as f:
        f.write(full_html)

    print(f"Compiling {temp_html_path} to {pdf_path} using WeasyPrint...")
    HTML(temp_html_path).write_pdf(pdf_path)
    
    # Clean up temp html file
    if os.path.exists(temp_html_path):
        os.remove(temp_html_path)
    print(f"Successfully generated {pdf_path}!")

if __name__ == "__main__":
    render_md_to_pdf("Commercial_Development_Proposal.md", "Commercial_Development_Proposal.pdf")
    render_md_to_pdf("External_Infrastructure_Cost_Breakdown.md", "External_Infrastructure_Cost_Breakdown.pdf")
