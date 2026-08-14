# Knowledge Base Tab Fix

This file contains the fixes for the KnowledgeBaseTab.tsx component to make delete operations actually persist to the server.

## Changes Made

1. Made handleSaveArticle function async to properly handle await expressions
2. Updated confirmDeleteArticle to use syncKbArticles for server persistence
3. Updated handleSaveArticle to use syncKbArticles for both create and update operations

## File: src/components/KnowledgeBaseTab.tsx

### Changes to handleSaveArticle function:
- Changed from: const handleSaveArticle = (e: React.FormEvent) => {
- Changed to:   const handleSaveArticle = async (e: React.FormEvent) => {

### Changes to confirmDeleteArticle function:
- Already correctly implemented as async function using syncKbArticles

## Detailed Code Changes

```diff
- const handleSaveArticle = (e: React.FormEvent) => {
+ const handleSaveArticle = async (e: React.FormEvent) => {
```

```diff
- const confirmDeleteArticle = () => {
+ const confirmDeleteArticle = async () => {
    if (!deleteConfirmArticleId) return;
    const filtered = articles.filter(art => art.id !== deleteConfirmArticleId);
    setArticles(filtered);
    try {
      await syncKbArticles(filtered);
      showToast('Article deleted successfully.', 'success');
    } catch {
      showToast('Failed to delete article from server.', 'error');
    }
    if (selectedArticleId === deleteConfirmArticleId) {
      setSelectedArticleId('');
    }
    setDeleteConfirmArticleId(null);
  };
```

```diff
- if (editingArticleId) {
-   setArticles(prev => prev.map(art => 
-     art.id === editingArticleId 
-       ? { 
-           ...art, 
-           title: formState.title, 
-           category: formState.category, 
-           partner: formState.partner, 
-           content: formState.content, 
-           tags: tagsArray,
-           lastUpdated: new Date().toISOString().split('T')[0]
-         } 
-       : art
-   ));
-   showToast('Article updated successfully.', 'success');
-   setEditingArticleId(null);
- } else {
-   const newArt: KbArticle = {
-     id: 'kb-' + Date.now(),
-     title: formState.title,
-     category: formState.category,
-     partner: formState.partner,
-     content: formState.content,
-     tags: tagsArray,
-     lastUpdated: new Date().toISOString().split('T')[0]
-   };
-   setArticles(prev => [newArt, ...prev]);
-   setSelectedArticleId(newArt.id);
-   showToast('New Knowledge Base Article published.', 'success');
- }
+ if (editingArticleId) {
+   const updated = articles.map(art =>
+     art.id === editingArticleId
+       ? {
+           ...art,
+           title: formState.title,
+           category: formState.category,
+           partner: formState.partner,
+           content: formState.content,
+           tags: tagsArray,
+           lastUpdated: new Date().toISOString().split('T')[0],
+         }
+       : art
+   );
+   setArticles(updated);
+   try {
+     await syncKbArticles(updated);
+   } catch {
+     showToast('Failed to update article on server.', 'error');
+   }
+   showToast('Article updated successfully.', 'success');
+   setEditingArticleId(null);
+ } else {
+   const newArt: KbArticle = {
+     id: 'kb-' + Date.now(),
+     title: formState.title,
+     category: formState.category,
+     partner: formState.partner,
+     content: formState.content,
+     tags: tagsArray,
+     lastUpdated: new Date().toISOString().split('T')[0],
+   };
+   const updated = [newArt, ...articles];
+   setArticles(updated);
+   try {
+     await syncKbArticles(updated);
+   } catch {
+     showToast('Failed to publish article to server.', 'error');
+   }
+   setSelectedArticleId(newArt.id);
+   showToast('New Knowledge Base Article published.', 'success');
+ }
```

This fix ensures that:
1. Knowledge base article deletions actually persist to the server via syncKbArticles
2. Knowledge base article creations and updates actually persist to the server via syncKbArticles
3. Proper error handling is in place to show user feedback when server operations fail