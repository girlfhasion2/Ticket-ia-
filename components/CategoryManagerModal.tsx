import React, { useEffect, useState } from 'react';
import { Category } from '../types';
import { db } from '../db';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';

interface CategoryManagerModalProps {
  isOpen: boolean;
  categories: Category[];
  onClose: () => void;
  onCategoriesUpdated: (categories: Category[], deletedCategoryId?: string) => void;
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  categories,
  onClose,
  onCategoriesUpdated,
}) => {
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<Category | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFormMode(null);
      setEditingCategory(null);
      setNameInput('');
      setConfirmDeleteCategory(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const openCreateForm = () => {
    setError(null);
    setEditingCategory(null);
    setNameInput('');
    setFormMode('create');
  };

  const openEditForm = (category: Category) => {
    setError(null);
    setEditingCategory(category);
    setNameInput(category.name);
    setFormMode('edit');
  };

  const returnToList = () => {
    if (isSaving || isDeleting) return;
    setError(null);
    setFormMode(null);
    setEditingCategory(null);
    setNameInput('');
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError('Escribe un nombre para la categoría.');
      return;
    }

    const duplicate = categories.some(
      (c) =>
        c.name.trim().toLowerCase() === trimmed.toLowerCase() &&
        c.id !== editingCategory?.id
    );
    if (duplicate) {
      setError('Ya existe una categoría con ese nombre.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (formMode === 'create') {
        const created = await db.categories.add(trimmed);
        onCategoriesUpdated([...categories, created]);
      } else if (formMode === 'edit' && editingCategory) {
        const updated = await db.categories.update(editingCategory.id, trimmed);
        onCategoriesUpdated(
          categories.map((c) => (c.id === updated.id ? updated : c))
        );
      }
      setFormMode(null);
      setEditingCategory(null);
      setNameInput('');
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la categoría.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteCategory || isDeleting) return;

    setIsDeleting(true);
    setError(null);
    try {
      const targetId = confirmDeleteCategory.id;
      await db.categories.delete(targetId);
      const next = categories.filter((c) => c.id !== targetId);
      onCategoriesUpdated(next, targetId);
      setConfirmDeleteCategory(null);
      if (editingCategory?.id === targetId) {
        setFormMode(null);
        setEditingCategory(null);
        setNameInput('');
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar la categoría.');
      setConfirmDeleteCategory(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Bottom Sheet Principal: Mis categorías */}
      <div
        onClick={() => !isSaving && !isDeleting && onClose()}
        className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end justify-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white w-full max-w-2xl rounded-t-3xl shadow-2xl border-t border-gray-100 max-h-[82vh] flex flex-col"
        >
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 shrink-0" />

          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Tag size={18} />
              </div>
              <h2 className="text-lg font-black text-gray-900">Mis categorías</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar gestión de categorías"
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 active-scale transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {error && !formMode && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-700 text-xs font-medium">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {categories.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-sm font-medium text-gray-500">
                  No tienes categorías creadas aún.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between gap-3 p-3.5 bg-gray-50 rounded-2xl border border-gray-100"
                  >
                    <span className="font-bold text-sm text-gray-900 truncate pl-1">
                      {cat.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditForm(cat)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-indigo-600 hover:bg-indigo-50 text-xs font-bold flex items-center gap-1.5 active-scale transition-colors"
                      >
                        <Pencil size={13} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setConfirmDeleteCategory(cat);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-red-600 hover:bg-red-50 text-xs font-bold flex items-center gap-1.5 active-scale transition-colors"
                      >
                        <Trash2 size={13} />
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={openCreateForm}
              className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active-scale transition-colors"
            >
              <Plus size={18} />
              Nueva categoría
            </button>
          </div>
        </div>
      </div>

      {/* Segundo Modal: Crear / Editar categoría */}
      {formMode && (
        <div
          onClick={returnToList}
          className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-gray-100 p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">
                {formMode === 'edit' ? 'Editar categoría' : 'Nueva categoría'}
              </h3>
              <button
                type="button"
                onClick={returnToList}
                aria-label="Cerrar"
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="category-name-input"
                  className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1"
                >
                  Nombre
                </label>
                <input
                  id="category-name-input"
                  type="text"
                  autoFocus
                  maxLength={40}
                  placeholder="Ej: Supermercado"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 border border-gray-200 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs font-medium">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={returnToList}
                  className="flex-1 py-3 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest active-scale disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active-scale disabled:opacity-50 transition-colors"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      Guardando...
                    </>
                  ) : formMode === 'edit' ? (
                    'Guardar cambios'
                  ) : (
                    'Crear categoría'
                  )}
                </button>
              </div>
            </form>

            {formMode === 'edit' && editingCategory && (
              <button
                type="button"
                disabled={isSaving || isDeleting}
                onClick={() => {
                  setError(null);
                  setConfirmDeleteCategory(editingCategory);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active-scale disabled:opacity-50 transition-colors"
              >
                <Trash2 size={15} />
                Eliminar categoría
              </button>
            )}

            <div className="pt-2 border-t border-gray-100 text-center">
              <button
                type="button"
                disabled={isSaving || isDeleting}
                onClick={returnToList}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <ArrowLeft size={14} />
                Volver a categorías
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminar categoría */}
      {confirmDeleteCategory && (
        <div
          onClick={() => !isDeleting && setConfirmDeleteCategory(null)}
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-gray-100 p-6 space-y-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-gray-900">
                  Eliminar categoría
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  ¿Eliminar la categoría &laquo;{confirmDeleteCategory.name}&raquo;? Los
                  tickets asociados quedarán sin categoría.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteCategory(null)}
                className="flex-1 py-3 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest active-scale disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-red-200 active-scale disabled:opacity-50 transition-colors"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    Borrando...
                  </>
                ) : (
                  'Eliminar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CategoryManagerModal;
