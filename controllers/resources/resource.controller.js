import Resource from '../../models/Resource.js';

export const getResources = async (req, res) => {
  try {
    const { chatbotId } = req.params;
    const resources = await Resource.find({ chatbotId, workspaceId: req.workspaceId }).sort({ createdAt: 1 });
    res.json({ resources });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener recursos' });
  }
};

export const createResource = async (req, res) => {
  try {
    const { chatbotId } = req.params;
    const { name, type, capacity, isClientSelectable, description, durationMinutes, bufferMinutes, schedule } = req.body;

    const resource = await Resource.create({
      chatbotId,
      workspaceId: req.workspaceId,
      name,
      type: type || 'table',
      capacity: capacity || 1,
      isClientSelectable: isClientSelectable || false,
      description,
      durationMinutes: durationMinutes || 60,
      bufferMinutes: bufferMinutes || 0,
      schedule: schedule || {},
    });

    res.status(201).json({ resource });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear recurso' });
  }
};

export const updateResource = async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await Resource.findOneAndUpdate(
      { _id: id, workspaceId: req.workspaceId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!resource) return res.status(404).json({ error: 'Recurso no encontrado' });
    res.json({ resource });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar recurso' });
  }
};

export const deleteResource = async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await Resource.findOneAndUpdate(
      { _id: id, workspaceId: req.workspaceId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!resource) return res.status(404).json({ error: 'Recurso no encontrado' });
    res.json({ message: 'Recurso desactivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar recurso' });
  }
};
